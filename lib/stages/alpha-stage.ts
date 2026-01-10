import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StatefulStack } from '../stacks/stateful-stack';
import { AppStack } from '../stacks/app-stack';

export interface AlphaStageProps extends cdk.StageProps {
  hostedZoneId: string;
  hostedZoneName: string;
  certificateArn: string;
}

export class AlphaStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: AlphaStageProps) {
    super(scope, id, props);

    // Stateful resources (DynamoDB tables)
    // No termination protection for alpha - we want fast iteration
    const statefulStack = new StatefulStack(this, 'Stateful');

    // Application resources (Lambda, API Gateway, ECS, CloudFront, Cognito, etc.)
    // Pass DNS IDs as strings - imports happen inside AppStack
    new AppStack(this, 'App', {
      businessesTable: statefulStack.businessesTable,
      jobsTable: statefulStack.jobsTable,
      campaignsTable: statefulStack.campaignsTable,
      hostedZoneId: props.hostedZoneId,
      hostedZoneName: props.hostedZoneName,
      certificateArn: props.certificateArn,
    });
  }
}
