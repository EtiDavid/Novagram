output "task_definition_arn" {
  value = aws_ecs_task_definition.task_definition.arn
}# T# he actual value to be outputted

output "task_definition_family" {
  value = aws_ecs_task_definition.task_definition.family
}

output "container_name" {
  value = "${var.name}-${var.task_name}-container"
}


