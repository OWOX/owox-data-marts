"""
Platform API endpoints for LinkedIn and Google services
"""
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database.base import get_db
from app.models.user import User
from app.models.platform_credential import PlatformCredential
from app.services.platforms.linkedin_service import LinkedInAdsService, LINKEDIN_ADS_ANALYTICS_FIELDS
from app.services.platforms.google_service import GoogleSheetsService, GoogleBigQueryService, GoogleAnalyticsService
from app.api.dependencies.auth import get_current_user

router = APIRouter()

# Pydantic models for request/response
class PlatformCredentialCreate(BaseModel):
    platform_name: str
    platform_display_name: str
    credentials: Dict[str, Any]
    account_name: Optional[str] = None

class PlatformCredentialResponse(BaseModel):
    id: int
    platform_name: str
    platform_display_name: str
    account_name: Optional[str] = None
    account_id: Optional[str] = None
    is_active: bool
    is_valid: bool
    last_validated_at: Optional[datetime] = None
    validation_error: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class LinkedInAccountResponse(BaseModel):
    id: str  # LinkedIn can return integers, so we'll convert them
    name: Optional[str] = None
    status: Optional[str] = None
    currency: Optional[str] = None
    type: Optional[str] = None
    
    @classmethod
    def from_linkedin_data(cls, data: dict):
        """Convert LinkedIn API response to model, handling type conversions"""
        return cls(
            id=str(data.get("id", "")),  # Convert int to string
            name=data.get("name"),
            status=data.get("status"), 
            currency=data.get("currency"),
            type=data.get("type")
        )

class DataCollectionRequest(BaseModel):
    platform_credential_id: int
    account_urns: List[str] = None
    start_date: datetime
    end_date: datetime
    fields: List[str]

class GoogleSheetsRequest(BaseModel):
    platform_credential_id: int
    title: str
    headers: List[str] = None

class GoogleBigQueryDatasetRequest(BaseModel):
    platform_credential_id: int
    dataset_id: str
    description: str = None

class GoogleBigQueryTableRequest(BaseModel):
    platform_credential_id: int
    dataset_id: str
    table_id: str
    schema: List[Dict[str, str]]


# LinkedIn Endpoints
@router.post("/linkedin/credentials", response_model=PlatformCredentialResponse)
async def create_linkedin_credentials(
    credential_data: PlatformCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create and validate LinkedIn credentials"""
    try:
        linkedin_service = LinkedInAdsService()
        
        # Validate credentials
        validation_result = await linkedin_service.validate_credentials(credential_data.credentials)
        
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid LinkedIn credentials: {validation_result['error']}"
            )
        
        # Encrypt credentials
        encrypted_credentials = linkedin_service.encrypt_credentials(credential_data.credentials)
        
        # Create database record
        db_credential = PlatformCredential(
            user_id=current_user.id,
            platform_name="linkedin",
            platform_display_name=credential_data.platform_display_name,
            encrypted_credentials=encrypted_credentials,
            account_name=credential_data.account_name or validation_result["account_info"]["name"],
            account_id=validation_result["account_info"]["id"],
            is_active=True,
            is_valid=True,
            last_validated_at=datetime.utcnow()
        )
        
        db.add(db_credential)
        db.commit()
        db.refresh(db_credential)
        
        return db_credential
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create LinkedIn credentials: {str(e)}"
        )

@router.get("/linkedin/credentials/{credential_id}/accounts", response_model=List[LinkedInAccountResponse])
async def get_linkedin_accounts(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get LinkedIn Ad Accounts for a credential"""
    try:
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "linkedin"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="LinkedIn credential not found")
        
        # Get accounts
        linkedin_service = LinkedInAdsService()
        credentials_data = linkedin_service.decrypt_credentials(credential.encrypted_credentials)
        accounts = await linkedin_service.get_ad_accounts(credentials_data)
        
        return accounts
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get LinkedIn accounts: {str(e)}"
        )

@router.post("/linkedin/collect-data")
async def collect_linkedin_data(
    request: DataCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Collect LinkedIn Ads analytics data"""
    try:
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == request.platform_credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "linkedin"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="LinkedIn credential not found")
        
        # Collect data
        linkedin_service = LinkedInAdsService()
        credentials_data = linkedin_service.decrypt_credentials(credential.encrypted_credentials)
        
        data = await linkedin_service.collect_ad_analytics(
            credentials_data,
            request.account_urns,
            request.start_date,
            request.end_date,
            request.fields
        )
        
        return {
            "status": "success",
            "records_collected": len(data),
            "data": data[:100] if len(data) > 100 else data  # Limit response size
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to collect LinkedIn data: {str(e)}"
        )

@router.get("/linkedin/fields")
async def get_linkedin_fields():
    """Get available LinkedIn Ads analytics fields"""
    return {
        "fields": LINKEDIN_ADS_ANALYTICS_FIELDS,
        "field_count": len(LINKEDIN_ADS_ANALYTICS_FIELDS)
    }


# Google Sheets Endpoints
@router.post("/google-sheets/credentials", response_model=PlatformCredentialResponse)
async def create_google_sheets_credentials(
    credential_data: PlatformCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create and validate Google Sheets credentials"""
    try:
        sheets_service = GoogleSheetsService()
        
        # Validate credentials
        validation_result = await sheets_service.validate_credentials(credential_data.credentials)
        
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Google Sheets credentials: {validation_result['error']}"
            )
        
        # Encrypt credentials
        encrypted_credentials = sheets_service.fernet.encrypt(
            json.dumps(credential_data.credentials).encode()
        ).decode()
        
        # Create database record
        db_credential = PlatformCredential(
            user_id=current_user.id,
            platform_name="google_sheets",
            platform_display_name=credential_data.platform_display_name,
            encrypted_credentials=encrypted_credentials,
            account_name=credential_data.account_name or "Google Sheets",
            is_active=True,
            is_valid=True,
            last_validated_at=datetime.utcnow()
        )
        
        db.add(db_credential)
        db.commit()
        db.refresh(db_credential)
        
        return db_credential
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Google Sheets credentials: {str(e)}"
        )

@router.post("/google-sheets/create-spreadsheet")
async def create_google_spreadsheet(
    request: GoogleSheetsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new Google Spreadsheet"""
    try:
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == request.platform_credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "google_sheets"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="Google Sheets credential not found")
        
        # Create spreadsheet
        sheets_service = GoogleSheetsService()
        credentials_data = sheets_service.decrypt_credentials(credential.encrypted_credentials)
        
        result = await sheets_service.create_spreadsheet(
            credentials_data,
            request.title,
            request.headers or []
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Google Spreadsheet: {str(e)}"
        )


# Google BigQuery Endpoints
@router.post("/google-bigquery/credentials", response_model=PlatformCredentialResponse)
async def create_google_bigquery_credentials(
    credential_data: PlatformCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create and validate Google BigQuery credentials"""
    try:
        bigquery_service = GoogleBigQueryService()
        
        # Validate credentials
        validation_result = await bigquery_service.validate_credentials(credential_data.credentials)
        
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Google BigQuery credentials: {validation_result['error']}"
            )
        
        # Encrypt credentials
        encrypted_credentials = bigquery_service.fernet.encrypt(
            json.dumps(credential_data.credentials).encode()
        ).decode()
        
        # Create database record
        db_credential = PlatformCredential(
            user_id=current_user.id,
            platform_name="google_bigquery",
            platform_display_name=credential_data.platform_display_name,
            encrypted_credentials=encrypted_credentials,
            account_name=credential_data.account_name or validation_result["account_info"]["project_id"],
            account_id=validation_result["account_info"]["project_id"],
            is_active=True,
            is_valid=True,
            last_validated_at=datetime.utcnow()
        )
        
        db.add(db_credential)
        db.commit()
        db.refresh(db_credential)
        
        return db_credential
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create Google BigQuery credentials: {str(e)}"
        )

@router.post("/google-bigquery/create-dataset")
async def create_bigquery_dataset(
    request: GoogleBigQueryDatasetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a BigQuery dataset"""
    try:
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == request.platform_credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "google_bigquery"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="Google BigQuery credential not found")
        
        # Create dataset
        bigquery_service = GoogleBigQueryService()
        credentials_data = bigquery_service.decrypt_credentials(credential.encrypted_credentials)
        
        result = await bigquery_service.create_dataset(
            credentials_data,
            request.dataset_id,
            request.description
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create BigQuery dataset: {str(e)}"
        )

@router.post("/google-bigquery/create-table")
async def create_bigquery_table(
    request: GoogleBigQueryTableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a BigQuery table"""
    try:
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == request.platform_credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "google_bigquery"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="Google BigQuery credential not found")
        
        # Create table
        bigquery_service = GoogleBigQueryService()
        credentials_data = bigquery_service.decrypt_credentials(credential.encrypted_credentials)
        
        result = await bigquery_service.create_table(
            credentials_data,
            request.dataset_id,
            request.table_id,
            request.schema
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create BigQuery table: {str(e)}"
        )
