from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_platform_credential import platform_credential as crud_platform_credential
from app.database.database import get_db
from app.models.user import User
from app.schemas.platform_credential import (
    PlatformCredential,
    PlatformCredentialCreate,
    PlatformCredentialUpdate,
    PlatformCredentialSafe
)

router = APIRouter()


@router.get("/", response_model=List[PlatformCredentialSafe])
def read_platform_credentials(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Retrieve platform credentials for current user
    """
    credentials = crud_platform_credential.get_multi_by_user(
        db, user_id=current_user.id, skip=skip, limit=limit
    )
    return credentials


@router.post("/", response_model=PlatformCredentialSafe)
def create_platform_credential(
    *,
    db: Session = Depends(get_db),
    credential_in: PlatformCredentialCreate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Create new platform credential
    """
    credential = crud_platform_credential.create_with_user(
        db=db, obj_in=credential_in, user_id=current_user.id
    )
    return credential


@router.put("/{credential_id}", response_model=PlatformCredentialSafe)
def update_platform_credential(
    *,
    db: Session = Depends(get_db),
    credential_id: int,
    credential_in: PlatformCredentialUpdate,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Update a platform credential
    """
    credential = crud_platform_credential.get(db=db, id=credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Platform credential not found")
    if credential.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    credential = crud_platform_credential.update(db=db, db_obj=credential, obj_in=credential_in)
    return credential


@router.get("/{credential_id}", response_model=PlatformCredentialSafe)
def read_platform_credential(
    *,
    db: Session = Depends(get_db),
    credential_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Get platform credential by ID
    """
    credential = crud_platform_credential.get(db=db, id=credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Platform credential not found")
    if credential.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return credential


@router.delete("/{credential_id}")
def delete_platform_credential(
    *,
    db: Session = Depends(get_db),
    credential_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a platform credential
    """
    credential = crud_platform_credential.get(db=db, id=credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Platform credential not found")
    if credential.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    credential = crud_platform_credential.remove(db=db, id=credential_id)
    return {"message": "Platform credential deleted successfully"}


@router.post("/{credential_id}/validate")
def validate_platform_credential(
    *,
    db: Session = Depends(get_db),
    credential_id: int,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    Validate a platform credential by testing API connection
    """
    credential = crud_platform_credential.get(db=db, id=credential_id)
    if not credential:
        raise HTTPException(status_code=404, detail="Platform credential not found")
    if credential.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # TODO: Implement platform-specific validation logic
    validation_result = crud_platform_credential.validate_credential(db=db, credential=credential)
    
    return {
        "is_valid": validation_result["is_valid"],
        "message": validation_result["message"],
        "permissions": validation_result.get("permissions", [])
    }
