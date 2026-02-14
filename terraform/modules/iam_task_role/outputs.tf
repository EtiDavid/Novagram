output "task_role_arns" {
  value = {
    for service_name, role in aws_iam_role.task_role :
    service_name => role.arn
  }
}
