# M1-003: Attach photos to hand-added cards

**Date:** 2026-09-06
**Context:** In M1, search-and-add is the primary way to add cards, but those items have no photos. The scan flow creates drafts with photos but no identification. Users need a way to attach photos to owned items.

**Decision:** The card detail page has an "Add photos" button that opens the same capture UI (front/back/tilt) used in the scan flow. Photos are uploaded, EXIF-stripped, and linked to the existing item. No new item or scan session is created — photos attach directly to the item.

**Consequence:** The photo upload action accepts an existing `itemId` and a `side` parameter. The capture UI component is shared between the scan page and the detail page add-photos flow.
