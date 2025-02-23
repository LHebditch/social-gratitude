# Social Gratitude

## prerequisites

Before deploying anything you need to have set up an AWS account and inside that set up the OIDC role `GithubActionsAssumeRole` that grants:

- full access to cloudformation
- read only access to ssm
- read only access to s3
- ability to assume and pass the cdk roles created by bootstrap step (deploy, lookup, and file-publishing)

You will also need to run the `cdk bootstrap` command in the desired acount to allow aws cdk to make changes
