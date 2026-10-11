# 20. Pure UTC Quiet Hours Arithmetic & Timezone Normalization

This diagram demonstrates how India Standard Time (IST = UTC + 5:30) quiet hours are evaluated using pure UTC arithmetic without server timezone dependencies.

---

```mermaid
flowchart TD
    InputTime[Input Timestamp: e.g. 2026-10-11T16:00:00Z] --> AddOffset["Add 330 Minutes (5h 30m) to Epoch Time:<br/>t_ist = new Date(date.getTime() + 330 * 60 * 1000)"]
    AddOffset --> ExtractHour["Extract UTCHours of Shifted Date:<br/>hour_ist = t_ist.getUTCHours()"]
    
    ExtractHour --> RangeCheck{"Is hour_ist >= 21 OR hour_ist < 9?"}
    
    RangeCheck -- No (Daylight: 09:00 to 20:59 IST) --> Immediate["Not Quiet Hours:<br/>return false<br/>(Allowed to send immediately)"]
    
    RangeCheck -- Yes (Nighttime: 21:00 to 08:59 IST) --> NightCalc["Quiet Hours Active:<br/>return true"]
    
    NightCalc --> CalcNextMorning{"Is hour_ist >= 21?"}
    CalcNextMorning -- Yes (Late Night) --> NextDay["Target Morning = Next IST Calendar Day at 09:00:00.000 IST"]
    CalcNextMorning -- No (Early Morning) --> SameDay["Target Morning = Same IST Calendar Day at 09:00:00.000 IST"]
    
    NextDay --> ConvertUTC["Subtract 330 Minutes to Convert Back to UTC:<br/>return new Date(targetUtcMs - 330 * 60 * 1000)"]
    SameDay --> ConvertUTC
    
    ConvertUTC --> ScheduledFor[Set Job scheduledFor = Target UTC Morning]

    style Immediate fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style ScheduledFor fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
```
