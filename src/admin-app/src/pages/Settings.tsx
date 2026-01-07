import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Server, Key, Users, ExternalLink } from 'lucide-react';

const Settings: React.FC = () => {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Configuration and system settings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* API Configuration */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              API Configuration
            </CardTitle>
            <CardDescription>
              Backend API endpoint settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">API Endpoint</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-muted px-3 py-2 text-sm flex-1">
                  https://api-alpha.savondesigns.com
                </code>
                <Badge variant="secondary" className="bg-accent/20 text-accent">
                  Active
                </Badge>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground">Environment</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="outline">Alpha</Badge>
                <span className="text-sm text-muted-foreground">Development environment</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cognito Configuration */}
        <Card className="card-gradient border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Authentication
            </CardTitle>
            <CardDescription>
              AWS Cognito configuration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">User Pool ID</p>
              <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm">
                us-east-1_xxxxxxxxx
              </code>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Client ID</p>
              <code className="mt-1 block rounded bg-muted px-3 py-2 text-sm">
                xxxxxxxxxxxxxxxxxxxxxxxxxx
              </code>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium text-muted-foreground">Region</p>
              <p className="mt-1 text-sm">us-east-1 (N. Virginia)</p>
            </div>
          </CardContent>
        </Card>

        {/* User Management */}
        <Card className="card-gradient border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
            <CardDescription>
              Manage team members and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">User management coming soon</p>
              <p className="text-sm text-muted-foreground mt-1">
                This feature will allow you to invite team members and manage permissions
              </p>
            </div>
          </CardContent>
        </Card>

        {/* External Links */}
        <Card className="card-gradient border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-primary" />
              Quick Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <a
                href="https://preview-alpha.savondesigns.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Preview Site</span>
              </a>
              <a
                href="https://console.aws.amazon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">AWS Console</span>
              </a>
              <a
                href="https://github.com/savondesigns"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">GitHub</span>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
