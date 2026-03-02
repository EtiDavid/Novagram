locals {
  ssm_prefix = "/novagram/production"
}

# ECS Cluster
resource "aws_ssm_parameter" "ecs_cluster_name" {
  name        = "${local.ssm_prefix}/ecs/cluster-name"
  description = "ECS cluster name for CI/CD deployments"
  type        = "String"
  value       = aws_ecs_cluster.main.name

  tags = {
    ManagedBy   = "Terraform"
    Purpose     = "CICD"
    Environment = "production"
  }
}