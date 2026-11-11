import pytest


@pytest.fixture(autouse=True)
def _fake_provider_switch(request, monkeypatch):
    # Most tests drive FakeProvider; the switch-off tests opt out with the `no_fake` marker.
    if "no_fake" not in request.keywords:
        monkeypatch.setenv("FOOD_KHATA_ENABLE_FAKE_PROVIDER", "1")
    else:
        monkeypatch.delenv("FOOD_KHATA_ENABLE_FAKE_PROVIDER", raising=False)
