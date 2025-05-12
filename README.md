# Social Gratitude

## Architecture

```mermaid
graph TD
    %% Client interactions
    Client[Client Application]
    
    %% API Gateway and Authentication
    APIG[API Gateway]
    Auth[JWT Authorizer]
    
    %% Main Lambda Functions
    GetEntries[Get Entries Lambda]
    SubmitEntries[Submit Entries Lambda]
    ShareEntries[Share Entries Lambda]
    AnalyzeEntries[Analyze Entries Lambda]
    ReactToEntry[React to Entry Lambda]
    
    %% Authentication Lambdas
    Login[Login Lambda]
    LoginConfirm[Login Confirm Lambda]
    
    %% Event Processing
    OnSubmit[On Submit Lambda]
    OnReaction[On Reaction Lambda]
    
    %% Storage and Queues
    DDB[(DynamoDB)]
    SQS[[Journal Queue]]
    
    %% Client to API Gateway
    Client -->|HTTP Requests| APIG
    APIG -->|Authorize| Auth
    
    %% API Routes
    APIG -->|GET /journal/social| GetEntries
    APIG -->|POST /journal/entries| SubmitEntries
    APIG -->|POST /journal/entries/share| ShareEntries
    APIG -->|POST /journal/reactions/react| ReactToEntry
    APIG -->|POST /auth/login| Login
    APIG -->|POST /auth/login/confirm| LoginConfirm
    
    %% Lambda to DynamoDB
    GetEntries -->|Query GSI2| DDB
    SubmitEntries -->|Write| DDB
    ShareEntries -->|Read| DDB
    ReactToEntry -->|Write| DDB
    Login -->|Write Token| DDB
    LoginConfirm -->|Verify Token| DDB
    
    %% Event Processing
    ShareEntries -->|Send Entry| SQS
    SQS -->|Trigger| AnalyzeEntries
    AnalyzeEntries -->|Write Social Entry| DDB
    
    %% DynamoDB Streams
    DDB -->|Stream New Entries| OnSubmit
    DDB -->|Stream Reactions| OnReaction
    OnSubmit -->|Update Streaks| DDB
    OnReaction -->|Update Scores| DDB

    %% Styling
    classDef lambda fill:#ff9900,stroke:#fff,stroke-width:2px,color:#fff;
    classDef storage fill:#3b48cc,stroke:#fff,stroke-width:2px,color:#fff;
    classDef queue fill:#ff4f8b,stroke:#fff,stroke-width:2px,color:#fff;
    classDef gateway fill:#41c464,stroke:#fff,stroke-width:2px,color:#fff;
    
    class GetEntries,SubmitEntries,ShareEntries,AnalyzeEntries,ReactToEntry,Login,LoginConfirm,OnSubmit,OnReaction lambda;
    class DDB storage;
    class SQS queue;
    class APIG,Auth gateway;
```

## Prerequisites

Before deploying anything you need to have set up an AWS account and inside that set up the OIDC role `GithubActionsAssumeRole` that grants:

- full access to cloudformation
- read only access to ssm
- read only access to s3
- ability to assume and pass the cdk roles created by bootstrap step (deploy, lookup, and file-publishing)

You will also need to run the `cdk bootstrap` command in the desired acount to allow aws cdk to make changes

You will need to create some parameters in param store. This is used for signing the JWT. If param store is not secure enough you can change the code in the auth stack to control where this value is pulled form.

- `/auth/jwt-secret`: will be used as the secret for signing jwt tokens
- `/auth/jwt-iss`: will be used as the issuer for signing jwt tokens
- `/auth/jwt-aud`: will be used as the audience for signing jwt tokens

> Reasoning: if it's being stored as an env var on the lambda then having it in secrets manager adds no extra security. TODO: can i do this better? i don't want to call secrets manager on every lambda cold start

## Security considerations
- we have the email in the JWT - maybe we use id here and email is only ever used for auth. having the gsi1 as the id allows us to get this info if we so need. I.E account management (FIXED: using id in JWT instead)
- the JWT uses a long secret BUT that could in theory, given enough time, be brute forced. We should rotate this
- OTP on it's own means if an attacker can see emails then they can get in. This could be as simple as seeing the notification on a phone and so the email should be formatted to not show code in subject or preview 