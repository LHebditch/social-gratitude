# Social Gratitude

## Prerequisites

Before deploying anything you need to have set up an AWS account and inside that set up the OIDC role `GithubActionsAssumeRole` that grants:

- full access to cloudformation
- read only access to ssm
- read only access to s3
- ability to assume and pass the cdk roles created by bootstrap step (deploy, lookup, and file-publishing)

You will also need to run the `cdk bootstrap` command in the desired acount to allow aws cdk to make changes

You will need to create the parameter `/auth/jwt-param` in param store. This is used for signing the JWT. If param store is not secure enough you can change the code in the auth stack to control where this value is pulled form.
> Reasoning: if it's being stored as an env var on the lambda then having it in secrets manager adds no extra security. TODO: can i do this better? i don't want to call secrets manager on every lambda cold start
