import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class SslCertificateResponse(BaseModel):
    id: uuid.UUID
    name: str
    expires_at: datetime
    is_active: bool
    uploaded_by: Optional[uuid.UUID]
    created_at: datetime
    model_config = {"from_attributes": True}


class BrandingResponse(BaseModel):
    company_name: str
    company_logo: str
    primary_color: str


class BrandingUpdate(BaseModel):
    company_name: Optional[str] = None
    primary_color: Optional[str] = None
