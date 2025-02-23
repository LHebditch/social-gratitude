import { Names, Stack, StackProps, aws_s3 as s3 } from "aws-cdk-lib";
import { Construct } from "constructs";

import { RemovalPolicy } from "aws-cdk-lib";

export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const uid: string = Names.uniqueId(this);

    // S3 bucket for future use
    new s3.Bucket(this, "artifacts-bucket", {
      bucketName: `artifacts-${uid}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
