# 15. Instagram Deliverable URL Validation & Campaign Deduplication

This diagram outlines how deliverable links are sanitized, validated against strict Instagram patterns, and deduplicated across the campaign.

---

```mermaid
flowchart TD
    InputURL[Creator Submits Instagram URL] --> Sanitize[Trim whitespace & lowercase domain]
    Sanitize --> RegexMatch{Match Instagram Post / Reel Regex?}
    
    RegexMatch -- No --> RejectFormat[HTTP 400 Bad Request:<br/>Must be a valid Instagram post or reel URL]
    
    RegexMatch -- Yes --> ExtractShortcode[Extract Unique Post Shortcode: e.g. C3x9_12]
    ExtractShortcode --> QueryDuplicates{Check Campaign Submissions:<br/>Does any submission in this campaign<br/>already use this URL or shortcode?}
    
    QueryDuplicates -- Yes (Duplicate Found) --> RejectDuplicate[HTTP 409 Conflict:<br/>This Instagram post has already been submitted for this campaign!]
    
    QueryDuplicates -- No (Unique Post) --> AcceptURL[Accept URL and Persist Submission]

    style AcceptURL fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style RejectFormat fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style RejectDuplicate fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```

---

### Regex Pattern Implementation (`src/utils/instagram.js`):
```javascript
const INSTAGRAM_URL_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)\/?.*$/;
```
