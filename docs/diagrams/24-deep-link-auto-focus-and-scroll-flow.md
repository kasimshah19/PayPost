# 24. Deep-Link Navigation, Tab Selection & Pulse Highlight Flow

This diagram shows how PayPost handles deep-links from notifications (e.g. `?tab=submissions&focus=<id>`) to switch tabs and smoothly scroll target cards into view.

---

```mermaid
flowchart TD
    NotificationClick[User Clicks Notification Link:<br/>/brand/campaigns/123?tab=submissions&focus=sub_99] --> PageMount[CampaignDetailPage Mounts]
    
    PageMount --> ReadQueryParams[Hook reads searchParams: tab='submissions', focus='sub_99']
    ReadQueryParams --> SwitchTab[Automatically switch active tab to 'Submissions']
    
    SwitchTab --> RenderList[Render Submission Cards List]
    RenderList --> ElementMounted{DOM Element with id='focus-sub_99' mounted?}
    
    ElementMounted -- No --> WaitFrame[Request next animation frame]
    WaitFrame --> ElementMounted
    
    ElementMounted -- Yes --> ScrollSmooth["Execute DOM Scroll:<br/>element.scrollIntoView({ behavior: 'smooth', block: 'center' })"]
    
    ScrollSmooth --> PulseHighlight["Apply CSS Animation Class:<br/>ring-2 ring-indigo-500 animate-pulse"]
    
    PulseHighlight --> ClearTimer["setTimeout(3000ms):<br/>Remove highlight ring"]

    style ScrollSmooth fill:#cfe2ff,stroke:#0d6efd,stroke-width:2px;
    style PulseHighlight fill:#d4edda,stroke:#28a745,stroke-width:2px;
```
