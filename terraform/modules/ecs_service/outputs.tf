output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.ecs_service.name
}

output "service_id" {
  description = "Full ARN of the ECS service"
  value       = aws_ecs_service.ecs_service.id
}

output "cluster_id" {
  description = "Cluster the service belongs to"
  value       = aws_ecs_service.ecs_service.cluster
}