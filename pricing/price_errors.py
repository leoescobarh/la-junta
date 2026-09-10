"""Excepciones compartidas entre el ejecutable y los adaptadores."""
class PriceError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class AccessBlocked(PriceError):
    pass
