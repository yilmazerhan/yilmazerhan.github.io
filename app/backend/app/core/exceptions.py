from fastapi import HTTPException, status


class AuthenticationError(HTTPException):
    def __init__(self, detail: str = "Kimlik doğrulama başarısız."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


class ForbiddenError(HTTPException):
    def __init__(self, detail: str = "Bu işlem için yetkiniz yok."):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class NotFoundError(HTTPException):
    def __init__(self, resource: str = "Kayıt"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=f"{resource} bulunamadı.")


class ConflictError(HTTPException):
    def __init__(self, detail: str = "Bu kayıt zaten mevcut."):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


class ValidationError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


class ServiceUnavailableError(HTTPException):
    def __init__(self, detail: str = "Servis geçici olarak kullanılamıyor."):
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
