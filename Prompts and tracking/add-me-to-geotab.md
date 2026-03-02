# Add ClearSkies to MyGeotab

## Steps

1. Log in to **MyGeotab**
2. Go to **Administration → System → System Settings**
3. Select the **Add-Ins** tab
4. Click **New Add-In**
5. Paste the JSON below into the configuration field
6. Click **OK** then **Save**
7. Refresh the page — **Clear Skies** will appear in the left navigation under Activity

---

## Add-In Configuration JSON

```json
{
    "name": "ClearSkies",
    "supportEmail": "support@clearskies.app",
    "version": "1.0.0",
    "items": [
        {
            "url": "https://reubenfrith.github.io/clearskies/index.html",
            "path": "ActivityLink/",
            "menuName": {
                "en": "Clear Skies"
            },
            "icon": "https://reubenfrith.github.io/clearskies/icon.svg"
        }
    ],
    "isSigned": false
}
```

---

## Access

- The secret password to access ClearSkies is `w3pG%RhW3Jscq6BES*%kj`

---

## Notes

- `isSigned: false` — Geotab may show a warning that the add-in is unsigned. This is expected for development/self-hosted add-ins; click through to proceed.
- The add-in is hosted on GitHub Pages. No local server is needed.
- The add-in requires a valid Geotab session — it will not function correctly when opened directly in a browser outside of MyGeotab.
