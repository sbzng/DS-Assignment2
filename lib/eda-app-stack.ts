import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { StreamViewType } from "aws-cdk-lib/aws-dynamodb";
import {  DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { StartingPosition } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket configuration
    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // DynamoDB table configuration
    const imagesTable = new dynamodb.Table(this, "ImagesTable", {
      partitionKey: { name: "filename", type: dynamodb.AttributeType.STRING },
      tableName: "Images",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Single SNS topic for all events
    const unifiedTopic = new sns.Topic(this, "UnifiedTopic", {
      displayName: "Unified Events Topic",
    });

    // SQS queue for image processing
    const imageProcessQueue = new sqs.Queue(this, "ImageProcessQueue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: new sqs.Queue(this, "DLQ"),
        maxReceiveCount: 2,
      },
    });

    // Lambda functions for processing and mailing
    const processImageFn = new lambdanode.NodejsFunction(this, "ProcessImageFn", {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
    });

    const deleteMailerFn = new lambdanode.NodejsFunction(this, "DeleteMailerFn", {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/deleteMailer.ts`,
      timeout: cdk.Duration.seconds(3),
      memorySize: 1024,
      environment: {
        TABLE_NAME: imagesTable.tableName,
      },
    });

    // Subscriptions and event sources setup
    unifiedTopic.addSubscription(new subs.LambdaSubscription(processImageFn));
    deleteMailerFn.addEventSource(new DynamoEventSource(imagesTable, {
      startingPosition: StartingPosition.TRIM_HORIZON,
      batchSize: 5,
      bisectBatchOnError: true,
      retryAttempts: 2,
  }));

    // S3 bucket notifications
    imagesBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SnsDestination(unifiedTopic));
    imagesBucket.addEventNotification(s3.EventType.OBJECT_REMOVED_DELETE, new s3n.SnsDestination(unifiedTopic));

    // Permissions
    imagesTable.grantStreamRead(deleteMailerFn);
    imagesTable.grantReadWriteData(processImageFn);

    // Output ARNs and other info
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
    new cdk.CfnOutput(this, "unifiedTopicARN", {
      value: unifiedTopic.topicArn,
    });
  }
}
