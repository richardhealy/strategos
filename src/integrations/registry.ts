import type { IntegrationKind } from "@prisma/client";
import type { Integration } from "@/integrations/types";
import { LinearIntegration } from "@/integrations/linear";
import { GitHubIntegration } from "@/integrations/github";
import { JiraIntegration } from "@/integrations/jira";
import { GitLabIntegration } from "@/integrations/gitlab";
import { AzureDevOpsIntegration } from "@/integrations/azuredevops";

// The five trackers strategos coordinates across.
export const integrations: Record<IntegrationKind, Integration> = {
  LINEAR: new LinearIntegration(),
  GITHUB: new GitHubIntegration(),
  JIRA: new JiraIntegration(),
  GITLAB: new GitLabIntegration(),
  AZURE_DEVOPS: new AzureDevOpsIntegration(),
};

export function integrationFor(kind: IntegrationKind): Integration {
  return integrations[kind];
}
