import sys
from types import SimpleNamespace

import pytest

from backend import providers


@pytest.mark.parametrize('cuda_available', [False, True])
def test_auxiliary_capabilities_require_cuda_even_when_packages_are_installed(monkeypatch, cuda_available):
    monkeypatch.setattr(providers.importlib.util, 'find_spec', lambda _: object())
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: cuda_available)))
    result = providers.capabilities()
    for feature in ('artwork', 'text', 'alignment', 'realaudio'):
        assert result[feature]['available'] is cuda_available
    assert result['video']['available'] is True
