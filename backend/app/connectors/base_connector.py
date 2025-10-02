"""
Base Connector Class
Based on base/connectors/src/Core/ structure
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Iterator
from enum import Enum
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class ConnectorType(str, Enum):
    """Supported connector types"""
    BANK_OF_CANADA = "bank_of_canada"
    BING_ADS = "bing_ads"
    CRITEO_ADS = "criteo_ads"
    FACEBOOK_MARKETING = "facebook_marketing"
    GITHUB = "github"
    LINKEDIN_ADS = "linkedin_ads"
    LINKEDIN_PAGES = "linkedin_pages"
    OPEN_EXCHANGE_RATES = "open_exchange_rates"
    OPEN_HOLIDAYS = "open_holidays"
    REDDIT_ADS = "reddit_ads"
    TIKTOK_ADS = "tiktok_ads"
    X_ADS = "x_ads"


class ConnectorStatus(str, Enum):
    """Connector execution status"""
    IDLE = "idle"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ConnectorConfig:
    """Connector configuration"""
    connector_type: ConnectorType
    credentials: Dict[str, Any]
    config: Dict[str, Any]
    streams: List[str] = None
    
    def __post_init__(self):
        if self.streams is None:
            self.streams = []


@dataclass
class ConnectorMessage:
    """Message from connector execution"""
    type: str  # LOG, RECORD, STATE, SPEC, etc.
    message: Dict[str, Any]
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


@dataclass
class ConnectorRecord:
    """Data record from connector"""
    stream: str
    data: Dict[str, Any]
    emitted_at: datetime = None
    
    def __post_init__(self):
        if self.emitted_at is None:
            self.emitted_at = datetime.utcnow()


@dataclass
class ConnectorState:
    """Connector state for incremental sync"""
    stream: str
    state: Dict[str, Any]
    
    
@dataclass
class ConnectorSpec:
    """Connector specification"""
    streams: List[Dict[str, Any]]
    connection_specification: Dict[str, Any]
    supported_sync_modes: List[str] = None
    
    def __post_init__(self):
        if self.supported_sync_modes is None:
            self.supported_sync_modes = ["full_refresh", "incremental"]


class BaseConnector(ABC):
    """Base class for all connectors"""
    
    def __init__(self, config: ConnectorConfig):
        self.config = config
        self.status = ConnectorStatus.IDLE
        self.logger = logging.getLogger(f"{self.__class__.__name__}")
        
    @property
    @abstractmethod
    def connector_type(self) -> ConnectorType:
        """Return the connector type"""
        pass
    
    @abstractmethod
    def check_connection(self) -> Dict[str, Any]:
        """
        Check if the connector can connect to the source
        Returns: {"status": "success"/"failed", "message": "..."}
        """
        pass
    
    @abstractmethod
    def discover(self) -> ConnectorSpec:
        """
        Discover available streams and their schemas
        Returns: ConnectorSpec with available streams
        """
        pass
    
    @abstractmethod
    def read(self, 
             streams: List[str] = None, 
             state: Dict[str, ConnectorState] = None) -> Iterator[ConnectorMessage]:
        """
        Read data from the source
        Args:
            streams: List of stream names to read
            state: Current state for incremental sync
        Yields: ConnectorMessage objects
        """
        pass
    
    def validate_config(self) -> Dict[str, Any]:
        """
        Validate connector configuration
        Returns: {"valid": True/False, "message": "..."}
        """
        try:
            # Basic validation
            if not self.config.credentials:
                return {"valid": False, "message": "Credentials are required"}
            
            # Connector-specific validation
            return self._validate_connector_config()
        except Exception as e:
            self.logger.error(f"Config validation failed: {e}")
            return {"valid": False, "message": str(e)}
    
    def _validate_connector_config(self) -> Dict[str, Any]:
        """
        Override this method for connector-specific validation
        """
        return {"valid": True, "message": "Configuration is valid"}
    
    def get_available_streams(self) -> List[str]:
        """Get list of available stream names"""
        try:
            spec = self.discover()
            return [stream["name"] for stream in spec.streams]
        except Exception as e:
            self.logger.error(f"Failed to get available streams: {e}")
            return []
    
    def emit_log(self, level: str, message: str) -> ConnectorMessage:
        """Emit a log message"""
        return ConnectorMessage(
            type="LOG",
            message={
                "level": level,
                "message": message,
                "connector_type": self.connector_type.value
            }
        )
    
    def emit_record(self, stream: str, data: Dict[str, Any]) -> ConnectorMessage:
        """Emit a data record"""
        record = ConnectorRecord(stream=stream, data=data)
        return ConnectorMessage(
            type="RECORD",
            message={
                "stream": record.stream,
                "data": record.data,
                "emitted_at": record.emitted_at.isoformat()
            }
        )
    
    def emit_state(self, stream: str, state: Dict[str, Any]) -> ConnectorMessage:
        """Emit state for incremental sync"""
        return ConnectorMessage(
            type="STATE",
            message={
                "stream": stream,
                "state": state
            }
        )
    
    def emit_spec(self, spec: ConnectorSpec) -> ConnectorMessage:
        """Emit connector specification"""
        return ConnectorMessage(
            type="SPEC",
            message={
                "streams": spec.streams,
                "connection_specification": spec.connection_specification,
                "supported_sync_modes": spec.supported_sync_modes
            }
        )
    
    def set_status(self, status: ConnectorStatus):
        """Set connector status"""
        self.status = status
        self.logger.info(f"Connector status changed to: {status.value}")
    
    def __str__(self):
        return f"{self.__class__.__name__}({self.connector_type.value})"
    
    def __repr__(self):
        return self.__str__()
