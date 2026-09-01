from adassassin.catalog import parse_catalog_markdown, static_catalog

SAMPLE = """
| ID | Category | Maturity | Environment | Tools | Fixture | Difficulty | Risk | Approval | Rollback | Auth modes | Username list | Active auth | Noise | Sensitivity | Summary |
|----|----------|----------|-------------|-------|---------|------------|------|----------|----------|------------|---------------|-------------|-------|-------------|---------|
| `ldap-enum` | enumeration | implemented | live-read-only | - | - | - | observe | none | none | - | no | no | unspecified | metadata | Enumerate directory objects |
| `dcsync` | credential-access | implemented | live-mutating | - | - | - | side_effect | force_and_ack | none | - | no | no | unspecified | metadata | Replicate secrets |
"""


def test_parse_catalog_markdown() -> None:
    items = parse_catalog_markdown(SAMPLE)
    assert [item["id"] for item in items] == ["ldap-enum", "dcsync"]
    assert items[0]["lane"] == "yellow"
    assert items[1]["lane"] == "red"


def test_static_catalog_has_capabilities() -> None:
    payload = static_catalog()
    assert payload["count"] >= 90
    assert payload["capabilities"][0]["id"]
