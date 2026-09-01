from adassassin.catalog import bundled_catalog


def test_bundled_catalog_has_ninety_two_capabilities() -> None:
    payload = bundled_catalog()
    assert payload["count"] == 92
    assert len(payload["capabilities"]) == 92
    assert payload["capabilities"][0]["id"]
