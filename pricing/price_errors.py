"""Excepciones compartidas entre el ejecutable y los adaptadores."""
class PriceError(Exception):
    def __init__(self, code, message, attempts=None):
        super().__init__(message)
        self.code = code
        self.attempts = attempts or []


class AccessBlocked(PriceError):
    pass

