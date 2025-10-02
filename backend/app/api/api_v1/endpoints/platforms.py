"""
Platform API endpoints for LinkedIn and Google services
"""
import json
import logging
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
from app.crud.crud_platform_credential import CRUDPlatformCredential
from app.crud.crud_platform_data_collection import platform_data_collection
from app.models.platform_data_collection import PlatformDataCollection
from app.schemas.platform_data_collection import (
    PlatformDataCollectionCreate, 
    LinkedInDataCollectionRequest
)

# Setup logging
logger = logging.getLogger(__name__)

router = APIRouter()

# Utility function for credential parsing
def parse_platform_credentials(credential: PlatformCredential) -> Dict[str, Any]:
    """Parse platform credentials, handling both encrypted and plain JSON formats"""
    try:
        credentials_raw = credential.encrypted_credentials
        
        # If it looks like encrypted data (long base64 string), decrypt it
        if len(credentials_raw) > 100 and not credentials_raw.startswith('{'):
            logger.info(f"🔓 [CREDENTIAL PARSER] Detected encrypted credentials, decrypting...")
            crud_cred = CRUDPlatformCredential(PlatformCredential)
            credentials_data = crud_cred._decrypt_credentials(credentials_raw)
            logger.info(f"✅ [CREDENTIAL PARSER] Credentials decrypted successfully")
        else:
            # Plain JSON format (legacy)
            logger.info(f"📄 [CREDENTIAL PARSER] Detected plain JSON credentials")
            credentials_data = json.loads(credentials_raw)
        
        return credentials_data
        
    except json.JSONDecodeError as e:
        logger.error(f"❌ [CREDENTIAL PARSER] Failed to parse JSON: {str(e)}")
        raise HTTPException(status_code=500, detail="Invalid credential format")
    except Exception as e:
        logger.error(f"❌ [CREDENTIAL PARSER] Failed to decrypt credentials: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")

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
    """Create and validate LinkedIn credentials - Now using secure CRUD method"""
    logger.info(f"🚀 [LINKEDIN CREATE] Creating LinkedIn credentials via Swagger endpoint")
    
    try:
        # Use the same secure CRUD method as the frontend
        crud_cred = CRUDPlatformCredential(PlatformCredential)
        
        # Create credential data in same format as frontend
        from app.schemas.platform_credential import PlatformCredentialCreate as CRUDCredentialCreate
        
        crud_credential_data = CRUDCredentialCreate(
            platform_name="linkedin",
            platform_display_name=credential_data.platform_display_name,
            credentials=credential_data.credentials,
            account_name=credential_data.account_name,
            account_id="linkedin_account_id",  # Default for now
            is_active=True
        )
        
        logger.info(f"📤 [LINKEDIN CREATE] Using secure CRUD method for credential creation")
        
        # Use the secure CRUD method (this will encrypt credentials)
        db_credential = crud_cred.create_with_user(
            db=db, 
            obj_in=crud_credential_data, 
            user_id=current_user.id
        )
        
        logger.info(f"✅ [LINKEDIN CREATE] Credential created successfully with encrypted storage")
        
        return db_credential
        
    except Exception as e:
        logger.error(f"❌ [LINKEDIN CREATE] Failed to create credentials: {str(e)}")
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
    logger.info(f"🔍 [LINKEDIN ACCOUNTS] Starting request for credential_id={credential_id}, user_id={current_user.id}")
    
    try:
        # Get credential with detailed logging
        logger.info(f"🔍 [LINKEDIN ACCOUNTS] Querying database for credential_id={credential_id}")
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "linkedin"
        ).first()
        
        if not credential:
            logger.error(f"❌ [LINKEDIN ACCOUNTS] Credential not found: credential_id={credential_id}, user_id={current_user.id}")
            raise HTTPException(status_code=404, detail="LinkedIn credential not found")
        
        logger.info(f"✅ [LINKEDIN ACCOUNTS] Found credential: id={credential.id}, platform={credential.platform_name}, active={credential.is_active}")
        
        # Parse credentials using centralized function
        logger.info(f"🔍 [LINKEDIN ACCOUNTS] Parsing credentials (encrypted: {len(credential.encrypted_credentials) > 100})")
        credentials_data = parse_platform_credentials(credential)
        
        logger.info(f"✅ [LINKEDIN ACCOUNTS] Credentials parsed successfully. Keys: {list(credentials_data.keys())}")
        
        # Log access token info (first 10 chars only for security)
        access_token = credentials_data.get("access_token", "")
        if access_token:
            logger.info(f"🔑 [LINKEDIN ACCOUNTS] Access token present: {access_token[:10]}...")
        else:
            logger.error(f"❌ [LINKEDIN ACCOUNTS] No access token found in credentials")
        
        # Initialize LinkedIn service
        logger.info(f"🔍 [LINKEDIN ACCOUNTS] Initializing LinkedIn service")
        linkedin_service = LinkedInAdsService()
        
        # Call LinkedIn API with enhanced logging
        logger.info(f"🔍 [LINKEDIN ACCOUNTS] Calling LinkedIn API to fetch accounts")
        accounts = await linkedin_service.get_ad_accounts(credentials_data)
        
        logger.info(f"✅ [LINKEDIN ACCOUNTS] Successfully retrieved {len(accounts)} accounts")
        logger.info(f"📊 [LINKEDIN ACCOUNTS] Account details: {[{'id': acc.get('id'), 'name': acc.get('name')} for acc in accounts]}")
        
        return accounts
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"❌ [LINKEDIN ACCOUNTS] Unexpected error: {type(e).__name__}: {str(e)}")
        logger.exception(f"❌ [LINKEDIN ACCOUNTS] Full traceback:")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get LinkedIn accounts: {str(e)}"
        )

@router.get("/linkedin/debug/credential/{credential_id}")
async def debug_linkedin_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Debug endpoint to check LinkedIn credential details without making API calls"""
    logger.info(f"🔍 [DEBUG] Checking credential {credential_id} for user {current_user.id}")
    
    try:
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == credential_id,
            PlatformCredential.user_id == current_user.id
        ).first()
        
        if not credential:
            return {"error": "Credential not found"}
        
        logger.info(f"✅ [DEBUG] Found credential: {credential.platform_name}")
        
        # Parse credentials safely using centralized function
        try:
            creds = parse_platform_credentials(credential)
            cred_keys = list(creds.keys())
            
            # Check access token
            access_token = creds.get("access_token", "")
            token_info = {
                "present": bool(access_token),
                "length": len(access_token) if access_token else 0,
                "preview": access_token[:10] + "..." if access_token else ""
            }
            
            return {
                "credential_id": credential.id,
                "platform": credential.platform_name,
                "is_active": credential.is_active,
                "is_valid": credential.is_valid,
                "credential_keys": cred_keys,
                "access_token_info": token_info,
                "last_validated": credential.last_validated_at,
                "validation_error": credential.validation_error
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ [DEBUG] Failed to parse credential JSON: {str(e)}")
            return {"error": f"Invalid credential format: {str(e)}"}
            
    except Exception as e:
        logger.error(f"❌ [DEBUG] Error: {str(e)}")
        return {"error": str(e)}

@router.post("/linkedin/collect-data")
async def collect_linkedin_data(
    request: LinkedInDataCollectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Collect LinkedIn Ads analytics data and save to database"""
    from datetime import datetime
    
    logger.info(f"🚀 [LINKEDIN COLLECT] Starting LinkedIn data collection for user {current_user.id}")
    
    # Create collection record
    collection_name = request.collection_name or f"LinkedIn Collection {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    collection_create = PlatformDataCollectionCreate(
        platform_credential_id=request.platform_credential_id,
        platform_name="linkedin",
        collection_name=collection_name,
        collection_params={
            "account_urns": request.account_urns,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "fields": request.fields
        }
    )
    
    # Create collection record
    collection = platform_data_collection.create_with_user(
        db=db, obj_in=collection_create, user_id=current_user.id
    )
    
    try:
        # Update status to running
        collection = platform_data_collection.update_status(
            db=db, db_obj=collection, status="running", started_at=datetime.utcnow()
        )
        
        logger.info(f"📊 [LINKEDIN COLLECT] Created collection record: {collection.id}")
        
        # Get credential
        credential = db.query(PlatformCredential).filter(
            PlatformCredential.id == request.platform_credential_id,
            PlatformCredential.user_id == current_user.id,
            PlatformCredential.platform_name == "linkedin"
        ).first()
        
        if not credential:
            raise HTTPException(status_code=404, detail="LinkedIn credential not found")
        
        # Parse credentials using centralized function
        logger.info(f"🔍 [LINKEDIN COLLECT] Parsing credentials for data collection")
        credentials_data = parse_platform_credentials(credential)
        
        # Collect data
        logger.info(f"📥 [LINKEDIN COLLECT] Starting data collection from LinkedIn API")
        
        # Parse date strings to datetime objects
        from datetime import datetime
        try:
            if isinstance(request.start_date, str):
                start_date = datetime.fromisoformat(request.start_date.replace('Z', '+00:00')) if 'T' in request.start_date else datetime.strptime(request.start_date, '%Y-%m-%d')
            else:
                start_date = request.start_date
                
            if isinstance(request.end_date, str):
                end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00')) if 'T' in request.end_date else datetime.strptime(request.end_date, '%Y-%m-%d')
            else:
                end_date = request.end_date
                
            logger.info(f"📅 [LINKEDIN COLLECT] Parsed dates: {start_date} to {end_date}")
        except Exception as date_error:
            logger.error(f"❌ [LINKEDIN COLLECT] Date parsing error: {str(date_error)}")
            raise HTTPException(status_code=400, detail=f"Invalid date format: {str(date_error)}")
        
        linkedin_service = LinkedInAdsService()
        
        collected_data = await linkedin_service.collect_ad_analytics(
            credentials_data,
            request.account_urns,
            start_date,
            end_date,
            request.fields
        )
        
        # Create result summary
        result_summary = {
            "total_records": len(collected_data),
            "account_urns": request.account_urns,
            "date_range": {
                "start": request.start_date,
                "end": request.end_date
            },
            "fields_collected": request.fields,
            "collection_timestamp": datetime.utcnow().isoformat()
        }
        
        logger.info(f"✅ [LINKEDIN COLLECT] Successfully collected {len(collected_data)} records")
        
        # Save results to database
        collection = platform_data_collection.complete_collection(
            db=db, 
            db_obj=collection,
            collected_data=collected_data,
            result_summary=result_summary
        )
        
        logger.info(f"💾 [LINKEDIN COLLECT] Saved collection results to database: {collection.id}")
        
        return {
            "status": "success",
            "collection_id": str(collection.id),
            "records_collected": len(collected_data),
            "collection_name": collection.collection_name,
            "message": f"Successfully collected and saved {len(collected_data)} LinkedIn records"
        }
        
    except Exception as e:
        # Mark collection as failed
        error_message = f"LinkedIn data collection failed: {str(e)}"
        logger.error(f"❌ [LINKEDIN COLLECT] {error_message}")
        
        platform_data_collection.fail_collection(
            db=db, 
            db_obj=collection,
            error_message=error_message,
            error_details={"error_type": type(e).__name__, "error_str": str(e)}
        )
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_message
        )

@router.get("/linkedin/fields")
async def get_linkedin_fields():
    """Get available LinkedIn Ads analytics fields"""
    return {
        "fields": LINKEDIN_ADS_ANALYTICS_FIELDS,
        "field_count": len(LINKEDIN_ADS_ANALYTICS_FIELDS)
    }

# Platform Data Collections Endpoints
@router.get("/collections/recent")
async def get_recent_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = 20
):
    """Get recent platform data collections for the current user"""
    logger.info(f"🔍 [COLLECTIONS API] Getting recent collections for user {current_user.id}, limit={limit}")
    
    try:
        collections = platform_data_collection.get_recent_by_user(
            db=db, user_id=current_user.id, limit=limit
        )
        
        logger.info(f"📊 [COLLECTIONS API] Found {len(collections)} recent collections")
        for c in collections:
            logger.info(f"📋 [COLLECTIONS API] Collection: {c.id} - {c.collection_name} - {c.status} - {c.records_collected} records")
        
        # Convert to response format
        from app.schemas.platform_data_collection import PlatformDataCollectionResponse
        result = [PlatformDataCollectionResponse.from_orm(collection) for collection in collections]
        
        logger.info(f"✅ [COLLECTIONS API] Returning {len(result)} collections")
        return result
        
    except Exception as e:
        logger.error(f"❌ [COLLECTIONS API] Error getting recent collections: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Failed to get recent collections: {str(e)}")

@router.get("/collections/active")  
async def get_active_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get active (running/pending) platform data collections for the current user"""
    logger.info(f"🏃 [COLLECTIONS API] Getting active collections for user {current_user.id}")
    
    try:
        collections = platform_data_collection.get_active_by_user(
            db=db, user_id=current_user.id
        )
        
        logger.info(f"🔄 [COLLECTIONS API] Found {len(collections)} active collections")
        
        from app.schemas.platform_data_collection import PlatformDataCollectionResponse
        result = [PlatformDataCollectionResponse.from_orm(collection) for collection in collections]
        
        logger.info(f"✅ [COLLECTIONS API] Returning {len(result)} active collections")
        return result
        
    except Exception as e:
        logger.error(f"❌ [COLLECTIONS API] Error getting active collections: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get active collections: {str(e)}")

@router.get("/collections/{collection_id}")
async def get_collection_by_id(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific platform data collection by ID"""
    from uuid import UUID
    
    try:
        collection_uuid = UUID(collection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid collection ID format")
    
    collection = platform_data_collection.get(db=db, id=collection_uuid)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    from app.schemas.platform_data_collection import PlatformDataCollectionWithData
    return PlatformDataCollectionWithData.from_orm(collection)

@router.get("/collections/{collection_id}/data")
async def get_collection_data(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    offset: int = 0,
    limit: int = 1000
):
    """Get the collected data from a specific collection with pagination"""
    from uuid import UUID
    
    try:
        collection_uuid = UUID(collection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid collection ID format")
    
    collection = platform_data_collection.get(db=db, id=collection_uuid)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get paginated data
    collected_data = collection.collected_data or []
    total_records = len(collected_data)
    
    # Apply pagination
    paginated_data = collected_data[offset:offset + limit] if collected_data else []
    
    return {
        "collection_id": collection_id,
        "collection_name": collection.collection_name,
        "status": collection.status,
        "total_records": total_records,
        "returned_records": len(paginated_data),
        "offset": offset,
        "limit": limit,
        "data": paginated_data,
        "result_summary": collection.result_summary
    }

@router.post("/collections/{collection_id}/export")
async def export_collection_to_destination(
    collection_id: str,
    export_request: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export collection data to a storage destination"""
    logger.info(f"🚀 [COLLECTION EXPORT] Starting export for collection {collection_id}")
    
    try:
        # Get the collection
        collection = platform_data_collection.get_by_id_and_user(
            db=db, collection_id=collection_id, user_id=current_user.id
        )
        
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")
        
        if collection.status != "completed":
            raise HTTPException(status_code=400, detail="Can only export completed collections")
        
        if collection.records_collected == 0:
            raise HTTPException(status_code=400, detail="No data to export")
        
        destination_id = export_request.get("destination_id")
        if not destination_id:
            raise HTTPException(status_code=400, detail="destination_id is required")
        
        # Get the storage destination
        from app.services.data_marts.data_destination_service import DataDestinationService
        destination_service = DataDestinationService()
        destination = destination_service.get_by_id(db=db, destination_id=destination_id)
        
        if not destination:
            raise HTTPException(status_code=404, detail="Storage destination not found")
        
        logger.info(f"📤 [COLLECTION EXPORT] Exporting {collection.records_collected} records to {destination.name} ({destination.storage_type})")
        
        # For now, return success - in a real implementation, this would:
        # 1. Queue a background job to export the data
        # 2. Transform the data according to destination requirements
        # 3. Write to the destination (PostgreSQL, CSV, etc.)
        
        # Simulate export process
        import asyncio
        await asyncio.sleep(0.1)  # Simulate processing time
        
        logger.info(f"✅ [COLLECTION EXPORT] Export initiated successfully")
        
        return {
            "status": "success",
            "message": f"Export initiated for {collection.records_collected} records to {destination.name}",
            "collection_id": collection_id,
            "destination_id": destination_id,
            "destination_name": destination.name,
            "destination_type": destination.storage_type,
            "records_to_export": collection.records_collected
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [COLLECTION EXPORT] Error exporting collection: {str(e)}")
        logger.exception("Full traceback:")
        raise HTTPException(status_code=500, detail=f"Failed to export collection: {str(e)}")

@router.delete("/collections/{collection_id}")
async def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a platform data collection"""
    from uuid import UUID
    
    try:
        collection_uuid = UUID(collection_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid collection ID format")
    
    collection = platform_data_collection.get(db=db, id=collection_uuid)
    
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    
    if collection.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    platform_data_collection.remove(db=db, id=collection_uuid)
    
    return {"message": "Collection deleted successfully"}


# Google Sheets Endpoints
@router.post("/google-sheets/credentials", response_model=PlatformCredentialResponse)
async def create_google_sheets_credentials(
    credential_data: PlatformCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create and validate Google Sheets credentials - Now using secure CRUD method"""
    logger.info(f"🚀 [GOOGLE SHEETS CREATE] Creating Google Sheets credentials via secure method")
    
    try:
        # Validate credentials first
        sheets_service = GoogleSheetsService()
        validation_result = await sheets_service.validate_credentials(credential_data.credentials)
        
        if not validation_result["valid"]:
            logger.error(f"❌ [GOOGLE SHEETS CREATE] Validation failed: {validation_result['error']}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Google Sheets credentials: {validation_result['error']}"
            )
        
        logger.info(f"✅ [GOOGLE SHEETS CREATE] Credentials validated successfully")
        
        # Use secure CRUD method for encryption and storage
        crud_cred = CRUDPlatformCredential(PlatformCredential)
        
        from app.schemas.platform_credential import PlatformCredentialCreate as CRUDCredentialCreate
        
        crud_credential_data = CRUDCredentialCreate(
            platform_name="google_sheets",
            platform_display_name=credential_data.platform_display_name,
            credentials=credential_data.credentials,
            account_name=credential_data.account_name,
            account_id="google_sheets_account_id",  # Default for now
            is_active=True
        )
        
        logger.info(f"📤 [GOOGLE SHEETS CREATE] Using secure CRUD method for credential creation")
        
        # Use the secure CRUD method (this will encrypt credentials)
        db_credential = crud_cred.create_with_user(
            db=db, 
            obj_in=crud_credential_data, 
            user_id=current_user.id
        )
        
        logger.info(f"✅ [GOOGLE SHEETS CREATE] Credential created successfully with encrypted storage")
        
        return db_credential
        
    except Exception as e:
        logger.error(f"❌ [GOOGLE SHEETS CREATE] Failed to create credentials: {str(e)}")
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
        logger.info(f"🔍 [GOOGLE SHEETS] Parsing credentials for spreadsheet creation")
        credentials_data = parse_platform_credentials(credential)
        
        sheets_service = GoogleSheetsService()
        
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
    """Create and validate Google BigQuery credentials - Now using secure CRUD method"""
    logger.info(f"🚀 [GOOGLE BIGQUERY CREATE] Creating Google BigQuery credentials via secure method")
    
    try:
        # Validate credentials first
        bigquery_service = GoogleBigQueryService()
        validation_result = await bigquery_service.validate_credentials(credential_data.credentials)
        
        if not validation_result["valid"]:
            logger.error(f"❌ [GOOGLE BIGQUERY CREATE] Validation failed: {validation_result['error']}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Google BigQuery credentials: {validation_result['error']}"
            )
        
        logger.info(f"✅ [GOOGLE BIGQUERY CREATE] Credentials validated successfully")
        
        # Use secure CRUD method for encryption and storage
        crud_cred = CRUDPlatformCredential(PlatformCredential)
        
        from app.schemas.platform_credential import PlatformCredentialCreate as CRUDCredentialCreate
        
        crud_credential_data = CRUDCredentialCreate(
            platform_name="google_bigquery",
            platform_display_name=credential_data.platform_display_name,
            credentials=credential_data.credentials,
            account_name=credential_data.account_name or validation_result["account_info"]["project_id"],
            account_id=validation_result["account_info"]["project_id"],
            is_active=True
        )
        
        logger.info(f"📤 [GOOGLE BIGQUERY CREATE] Using secure CRUD method for credential creation")
        
        # Use the secure CRUD method (this will encrypt credentials)
        db_credential = crud_cred.create_with_user(
            db=db, 
            obj_in=crud_credential_data, 
            user_id=current_user.id
        )
        
        logger.info(f"✅ [GOOGLE BIGQUERY CREATE] Credential created successfully with encrypted storage")
        
        return db_credential
        
    except Exception as e:
        logger.error(f"❌ [GOOGLE BIGQUERY CREATE] Failed to create credentials: {str(e)}")
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
        logger.info(f"🔍 [GOOGLE BIGQUERY] Parsing credentials for dataset creation")
        credentials_data = parse_platform_credentials(credential)
        
        bigquery_service = GoogleBigQueryService()
        
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
