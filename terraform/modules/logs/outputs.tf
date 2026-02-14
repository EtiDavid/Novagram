output "log_group_names" {
  value = { for k, v in aws_cloudwatch_log_group.service_logs : k => v.name }
}

output "log_group_arns" {
  value = { for k, v in aws_cloudwatch_log_group.service_logs : k => v.arn }
}