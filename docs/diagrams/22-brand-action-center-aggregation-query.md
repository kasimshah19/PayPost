# 22. Brand Action Center Single-Query Aggregation Architecture

This diagram shows how the Brand Action Center endpoint aggregates urgent tasks across all campaigns into a single response to avoid mobile network request chatter.

---

```mermaid
flowchart TD
    BrandClient[Mobile Client: GET /api/creator/attention] --> Auth[Verify Brand Authentication]
    Auth --> FetchCamps["Find All Active Campaigns for Brand:<br/>Campaign.find({ brand: brandId, status: 'active' })"]
    
    FetchCamps --> ParallelQueries[Execute Parallel Aggregations via Promise.all]
    
    subgraph Aggregation Engine [Parallel MongoDB Queries]
        ParallelQueries --> QueryApplicants["Application.find({<br/>  campaign: { $in: campaignIds },<br/>  status: 'applied'<br/>}).populate('creator campaign')"]
        
        ParallelQueries --> QuerySubmissions["Submission.find({<br/>  campaign: { $in: campaignIds },<br/>  status: 'submitted'<br/>}).populate('creator campaign')"]
    end
    
    QueryApplicants --> CombineResponse
    QuerySubmissions --> CombineResponse
    
    CombineResponse["Assemble Unified Attention DTO:<br/>{<br/>  pendingApplicants: [...],<br/>  pendingSubmissions: [...],<br/>  totalUrgentCount: N<br/>}"]
    
    CombineResponse --> ReturnClient[HTTP 200 OK: Single Payload for Mobile View]

    style ReturnClient fill:#d4edda,stroke:#28a745,stroke-width:2px;
```
