resource "aws_cloudwatch_log_group" "service_logs" {
  for_each = var.services

  name              = "/ecs/${var.name}/${each.key}"
  retention_in_days = var.log_retention_days
}