"""
Storage Factory
Creates appropriate storage facade based on storage type
"""

from typing import Dict, Any, Union
from app.models.data_storage import DataStorageType
from app.services.storage.bigquery_facade import BigQueryFacade
from app.services.storage.athena_facade import AthenaFacade
import logging

logger = logging.getLogger(__name__)


class StorageFactory:
    """Factory for creating storage facades"""
    
    @staticmethod
    def create_storage_facade(
        storage_type: DataStorageType,
        config: Dict[str, Any],
        credentials: Dict[str, Any]
    ) -> Union[BigQueryFacade, AthenaFacade]:
        """Create appropriate storage facade based on type"""
        
        if storage_type == DataStorageType.BIGQUERY:
            return BigQueryFacade(config, credentials)
        elif storage_type == DataStorageType.ATHENA:
            return AthenaFacade(config, credentials)
        else:
            raise ValueError(f"Unsupported storage type: {storage_type}")
    
    @staticmethod
    def get_supported_storage_types() -> list[DataStorageType]:
        """Get list of supported storage types"""
        return [DataStorageType.BIGQUERY, DataStorageType.ATHENA]
    
    @staticmethod
    def validate_storage_config(
        storage_type: DataStorageType,
        config: Dict[str, Any],
        credentials: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate storage configuration without creating facade"""
        try:
            # Create facade to test configuration
            facade = StorageFactory.create_storage_facade(storage_type, config, credentials)
            
            # Test connection
            result = facade.test_connection()
            
            return {
                "valid": result["status"] == "success",
                "message": result["message"],
                "details": result.get("details", {})
            }
            
        except Exception as e:
            logger.error(f"Storage config validation failed: {e}")
            return {
                "valid": False,
                "message": str(e)
            }


# Global factory instance
storage_factory = StorageFactory()
