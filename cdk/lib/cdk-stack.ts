import { Names, Stack, StackProps, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

import { RemovalPolicy } from "aws-cdk-lib";
import auth from "./auth-stack";
import gratitude from "./gratitude-stack";

const RESOURCE_PREFIX = "sograt";

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // S3 bucket for artifacts
    new s3.Bucket(this, "artifacts-bucket", {
      bucketName: `${RESOURCE_PREFIX}-artifacts-${scope.node.addr}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const { authorizer } = auth.build(this);
    gratitude.build(this, authorizer);
  }
}
