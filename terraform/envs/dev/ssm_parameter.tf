data "aws_caller_identity" "current" {}

locals {
  ssm_prefix = "/novagram/production"

  # Map of all CI/CD parameters
  ssm_parameters = {
    # ECS Cluster
    "ecs/cluster-name" = module.ecs_cluster.cluster_name

    # Backend Service
    "ecs/backend/service-name"        = module.backend_ecs_service.service_name
    "ecs/backend/task-family"         = module.backend_task_definition.task_definition_family
    "ecs/backend/container-name"      = module.backend_task_definition.container_name
    "ecs/backend/target-group-arn"    = module.backend_target_group.aws_lb_target_group_arn

    # Frontend Service
    "ecs/frontend/service-name"       = module.frontend_ecs_service.service_name
    "ecs/frontend/task-family"        = module.frontend_task_definition.task_definition_family
    "ecs/frontend/container-name"     = module.frontend_task_definition.container_name
    "ecs/frontend/target-group-arn"   = module.frontend_target_group.aws_lb_target_group_arn

    # ALB
    "alb/dns-name" = module.load_balancers.dns_name
    "alb/arn"      = module.load_balancers.arn

    # AWS Configuration
    "aws/region"     = var.aws_region
    "aws/account-id" = data.aws_caller_identity.current.account_id

    # GitHub Actions Role
    "github-actions/role-arn" = module.githubAction_agent.github_action_iam_role
  }
}

# Create all SSM parameters using for_each
resource "aws_ssm_parameter" "cicd_parameters" {
  for_each = local.ssm_parameters

  name        = "${local.ssm_prefix}/${each.key}"
  description = "CI/CD parameter: ${each.key}"
  type        = "String"
  value       = each.value

  tags = {
    ManagedBy   = "Terraform"
    Purpose     = "CICD"
    Environment = "production"
    Project     = var.project_name
  }
}

# Output all created parameter names for documentation
output "ssm_parameters_created" {
  description = "SSM parameters available for CI/CD (parameter paths)"
  value = {
    for key, param in aws_ssm_parameter.cicd_parameters :
    key => param.name
  }
}

output "ssm_parameter_values" {
  description = "SSM parameter values (for verification only - not exposed in state)"
  value = {
    for key, param in aws_ssm_parameter.cicd_parameters :
    key => param.value
  }
  sensitive = true  # Set to true if any values are sensitive
}