"""
Connector Registry
Manages registration and instantiation of connectors
"""

from typing import Dict, Type, List, Optional
from app.connectors.base_connector import BaseConnector, ConnectorType, ConnectorConfig
import logging

logger = logging.getLogger(__name__)


class ConnectorRegistry:
    """Registry for managing connector types and instances"""
    
    def __init__(self):
        self._connectors: Dict[ConnectorType, Type[BaseConnector]] = {}
        self._instances: Dict[str, BaseConnector] = {}
    
    def register(self, connector_type: ConnectorType, connector_class: Type[BaseConnector]):
        """Register a connector class"""
        if not issubclass(connector_class, BaseConnector):
            raise ValueError(f"Connector class must inherit from BaseConnector")
        
        self._connectors[connector_type] = connector_class
        logger.info(f"Registered connector: {connector_type.value} -> {connector_class.__name__}")
    
    def unregister(self, connector_type: ConnectorType):
        """Unregister a connector type"""
        if connector_type in self._connectors:
            del self._connectors[connector_type]
            logger.info(f"Unregistered connector: {connector_type.value}")
    
    def get_connector_class(self, connector_type: ConnectorType) -> Optional[Type[BaseConnector]]:
        """Get connector class by type"""
        return self._connectors.get(connector_type)
    
    def create_connector(self, config: ConnectorConfig) -> BaseConnector:
        """Create a connector instance"""
        connector_class = self.get_connector_class(config.connector_type)
        if not connector_class:
            raise ValueError(f"Unknown connector type: {config.connector_type.value}")
        
        instance = connector_class(config)
        instance_id = f"{config.connector_type.value}_{id(instance)}"
        self._instances[instance_id] = instance
        
        logger.info(f"Created connector instance: {instance_id}")
        return instance
    
    def get_instance(self, instance_id: str) -> Optional[BaseConnector]:
        """Get connector instance by ID"""
        return self._instances.get(instance_id)
    
    def remove_instance(self, instance_id: str):
        """Remove connector instance"""
        if instance_id in self._instances:
            del self._instances[instance_id]
            logger.info(f"Removed connector instance: {instance_id}")
    
    def list_connector_types(self) -> List[ConnectorType]:
        """List all registered connector types"""
        return list(self._connectors.keys())
    
    def list_instances(self) -> List[str]:
        """List all active connector instances"""
        return list(self._instances.keys())
    
    def is_registered(self, connector_type: ConnectorType) -> bool:
        """Check if connector type is registered"""
        return connector_type in self._connectors
    
    def get_connector_info(self, connector_type: ConnectorType) -> Dict[str, any]:
        """Get information about a connector type"""
        connector_class = self.get_connector_class(connector_type)
        if not connector_class:
            return None
        
        return {
            "type": connector_type.value,
            "class_name": connector_class.__name__,
            "module": connector_class.__module__,
            "doc": connector_class.__doc__
        }
    
    def clear_instances(self):
        """Clear all connector instances"""
        self._instances.clear()
        logger.info("Cleared all connector instances")


# Global registry instance
connector_registry = ConnectorRegistry()


def register_connector(connector_type: ConnectorType):
    """Decorator for registering connectors"""
    def decorator(connector_class: Type[BaseConnector]):
        connector_registry.register(connector_type, connector_class)
        return connector_class
    return decorator


# Auto-register connectors when imported
def auto_register_connectors():
    """Auto-register all available connectors"""
    connector_modules = [
        "bank_of_canada",
        "bing_ads", 
        "criteo_ads",
        "facebook_marketing",
        "github",
        "linkedin_ads",
        "linkedin_pages",
        "open_exchange_rates",
        "open_holidays",
        "reddit_ads",
        "tiktok_ads",
        "x_ads"
    ]
    
    registered_count = 0
    for module_name in connector_modules:
        try:
            __import__(f"app.connectors.sources.{module_name}")
            registered_count += 1
        except ImportError as e:
            logger.warning(f"Could not import connector {module_name}: {e}")
        except Exception as e:
            logger.error(f"Error registering connector {module_name}: {e}")
    
    logger.info(f"Auto-registered {registered_count}/{len(connector_modules)} connectors")


# Initialize registry on module import
auto_register_connectors()
