const { Stack, Duration, RemovalPolicy, Fn } = require('aws-cdk-lib');
const path = require('path');
const cdk = require('aws-cdk-lib')
const rds = require('aws-cdk-lib/aws-rds');
const ec2 = require('aws-cdk-lib/aws-ec2');
const s3 = require('aws-cdk-lib/aws-s3');
const sns = require('aws-cdk-lib/aws-sns');
const lambda = require('aws-cdk-lib/aws-lambda');
const { S3EventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const destinations = require('aws-cdk-lib/aws-lambda-destinations');
const { PolicyStatement, Effect } = require('aws-cdk-lib/aws-iam');
const { ManagedPolicy, AnyPrincipal } = require('aws-cdk-lib/aws-iam');
const iam = require('aws-cdk-lib/aws-iam');

class It3122CdkStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const vpc = new ec2.Vpc(this, "IT3122-CDK-VPC", {
      cidr: '10.0.0.0/16',
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'web-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 28
        },
        {
          name: 'db-subnet',
          subnetType: ec2.SubnetType.PUBLIC, // This is an AWS issue which requires it to be public or else AWS doesn't assign a public IP to our web server.
          cidrMask: 28
        }
      ]
    });



    const rdsInstanceSecurityGroup = new ec2.SecurityGroup(this, 'IT3122-RDS-SecurityGroup', {
      vpc
    });

    rdsInstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      'Allow Public Access connection from public'
    );

    rdsInstanceSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.allTcp(),
      'Allow Return connection from public'
    );

    const rdsDbInstance = new rds.DatabaseInstance(this, 'IT3122-RDS-Instance', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      engine: rds.DatabaseInstanceEngine.mariaDb({
        version: rds.MariaDbEngineVersion.VER_10_6_10
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      // credentials: {
      //   username: "admin",
      //   password: cdk.SecretValue.unsafePlainText("password")
      // },
      credentials: rds.Credentials.fromPassword("admin", cdk.SecretValue.unsafePlainText("password")),
      multiAz: false,
      allocatedStorage: 30,
      maxAllocatedStorage: 105,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: false,
      backupRetention: cdk.Duration.days(0),
      deleteAutomatedBackups: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deleteProtection: false,
      publiclyAccessible: true, // To Change Ltr,
      securityGroups: [rdsInstanceSecurityGroup]
    });

    // rdsDbInstance.connections.allowFrom(ec2Instance, ec2.Port.tcp(3306));

    const LostnFoundBucket = new s3.Bucket(this, "LostNfoundBucket", {
      bucketName: "it3122-bucket-item-images-zhenkai-cdk",
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true
    });

    LostnFoundBucket.grantRead(new AnyPrincipal());
    LostnFoundBucket.grantWrite(new AnyPrincipal());

    const LostnFoundSNSTopic = new sns.Topic(this, 'LostnFoundNotification', {
      topicName: "LostItemNotification"
    });

    const ec2InstanceSecurityGroup = new ec2.SecurityGroup(this, 'IT3122-EC2-SecurityGroup', {
      vpc
    });

    ec2InstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP connection from public'
    );

    ec2InstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8002),
      'Allow ExpressJS port connection from public'
    );

    ec2InstanceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH connection from public'
    );

    const script = `#! /bin/bash
    sudo yum install -y gcc-c++ make
    curl -sL https://rpm.nodesource.com/setup_16.x | sudo -E bash -
    sudo yum install -y nodejs
    sudo yum install -y git
    git clone https://github.com/hzk2021/Lost-and-Found.git
    cd /Lost-and-Found
    sudo npm i
    DB_HOST="${rdsDbInstance.dbInstanceEndpointAddress}" S3_BUCKET_NAME="${LostnFoundBucket.bucketName}" SNS_TOPIC_ARN="${LostnFoundSNSTopic.topicArn}" AWS_REGION="${this.region}" node app.js`;

    const userdata = ec2.UserData.custom(script);

    const ec2Instance = new ec2.Instance(this, 'IT3122-CDK-Lost-n-Found', {
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: ec2InstanceSecurityGroup,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
      }),
      userData: userdata
    });

    ec2Instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonSNSFullAccess"))
    ec2Instance.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonRekognitionFullAccess"))

    new cdk.CfnOutput(this, 'DB_HOST', {
      value: rdsDbInstance.dbInstanceEndpointAddress
    });
    
    new cdk.CfnOutput(this, 'S3_BUCKET_NAME', {
      value: LostnFoundBucket.bucketName
    });


    new cdk.CfnOutput(this, 'SNS_TOPIC_ARN', {
      value: LostnFoundSNSTopic.topicArn
    });


  }
}

module.exports = { It3122CdkStack }