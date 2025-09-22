from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.crud.crud_user import user as crud_user
from app.database.database import get_db
from app.models.user import User as UserModel
from app.schemas.user import User, UserCreate, UserUpdate

router = APIRouter()


@router.get("/me", response_model=User)
def read_user_me(
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user
    """
    return current_user


@router.put("/me", response_model=User)
def update_user_me(
    *,
    db: Session = Depends(get_db),
    password: str = None,
    full_name: str = None,
    email: str = None,
    current_user: UserModel = Depends(deps.get_current_user),
) -> Any:
    """
    Update own user
    """
    current_user_data = UserUpdate(**current_user.__dict__)
    if password is not None:
        current_user_data.password = password
    if full_name is not None:
        current_user_data.full_name = full_name
    if email is not None:
        current_user_data.email = email
    
    user = crud_user.update(db, db_obj=current_user, obj_in=current_user_data)
    return user


@router.get("/{user_id}", response_model=User)
def read_user_by_id(
    user_id: int,
    current_user: UserModel = Depends(deps.get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """
    Get a specific user by id
    """
    user = crud_user.get(db, id=user_id)
    if user == current_user:
        return user
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=400, detail="The user doesn't have enough privileges"
        )
    return user


@router.post("/", response_model=User)
def create_user(
    *,
    db: Session = Depends(get_db),
    user_in: UserCreate,
    current_user: UserModel = Depends(deps.get_current_active_superuser),
) -> Any:
    """
    Create new user (admin only)
    """
    user = crud_user.get_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    user = crud_user.create(db, obj_in=user_in)
    return user
