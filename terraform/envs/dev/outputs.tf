output "dns" {
  value = module.load_balancers.dns_name
}
output "backend_service_name" {
  value = module.backend_ecs_service.service_name
}

output "frontend_service_name" {
  value = module.frontend_ecs_service.service_name
}

output "backend_task_definition_family_name" {
  value = module.backend_task_definition.task_definition_family
}

output "frontend_task_definition_family_name" {
  value = module.frontend_task_definition.task_definition_family
}

output "cluster_name" {
  value = module.ecs_cluster.cluster_name
}

output "aws_region" {
  value = var.aws_region
}

output "github_actions_role_arn" {
  value = module.githubAction_agent.github_action_iam_role
}

output "ALB_arn" {
  value = module.load_balancers.arn
}

output "aws_account" {
  value = module.policies.aws_account_id
}

output "backend_target_group" {
  value = module.backend_target_group.aws_lb_target_group_arn
}

output "frontend_target_group" {
  value = module.frontend_target_group.aws_lb_target_group_arn
}