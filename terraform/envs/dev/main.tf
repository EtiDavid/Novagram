module "network" {
  source = "../../modules/network/"
  name = var.project_name
  vpc_cidr = var.vpc_cidr
  public_subnet_cidr = var.public_subnet_cidrs


}

module "security_groups" {
  source = "../../modules/security_groups/"
  name = var.project_name
  vpc_id = module.network.vpc_id

}

module "load_balancers" {
  source                    = "../../modules/alb/"
  name                      = var.project_name
  subnets                   = module.network.public_subnet_ids
  security_groups           = [module.security_groups.alb_sg_id]
  frontend_target_group_arn = module.frontend_target_group.aws_lb_target_group_arn
  backend_target_group_arn  = module.backend_target_group.aws_lb_target_group_arn
}

module "backend_target_group" {
  source = "../../modules/target_group/"
  health_check = "/health"
  vpc_id = module.network.vpc_id
  name = var.project_name
  port = 5000
  protocol = "HTTP"
  service_name = "backend"
  enable_stickiness = true
}

module "frontend_target_group" {
  source = "../../modules/target_group/"
  health_check = "/"
  vpc_id = module.network.vpc_id
  name = var.project_name
  port = 80
  protocol = "HTTP"
  service_name = "frontend"
}

module "ecs_cluster" {
  source = "../../modules/ecs_cluster/"
  name = var.project_name
}

module "log_group" {
  source = "../../modules/logs/"
  name = var.project_name
  log_retention_days = var.log_retention_days
  services = {
    backend = {}
    frontend = {}
  }
}

module "policies" {
  source = "../../modules/policies/"
  name = var.project_name
  aws_region = var.aws_region
}

module "iam_task_role" {
  source = "../../modules/iam_task_role/"
  name   = var.project_name
  services = {
    backend = {
      policy_arns = [module.policies.secrets_policy_arn]
    }
    frontend = {
      policy_arns = []
    }
  }
}

module "iam_execution_role" {
  source = "../../modules/iam_execution_role/"
  name = var.project_name
  secrets_policy_arn = module.policies.secrets_policy_arn
}

module "backend_task_definition" {
  source             = "../../modules/task_definition/"
  name               = var.project_name
  task_name          = "backend"
  task_memory        = 1024
  task_cpu           = 512
  container_cpu      = 512
  container_memory   = 1024
  container_port     = 5000
  image              = "davidchimere/novagram-backend:latest"
  task_role_arn      = module.iam_task_role.task_role_arns["backend"] #understand
  execution_role_arn = module.iam_execution_role.task_execution_role_arn
  log_group_name     = module.log_group.log_group_names["backend"]
  aws_region         = var.aws_region
  environment        = var.backend_environment
  secrets            = var.backend_secrets
}

module "backend_ecs_service" {
  source = "../../modules/ecs_service/"
  name = var.project_name
  task_name = "backend"
  cluster_id = module.ecs_cluster.cluster_id
  task_definition_arn = module.backend_task_definition.task_definition_arn
  desired_count = 1
  security_group_ids = [module.security_groups.backend_sg_id]
  subnet_ids = module.network.public_subnet_ids
  target_group_arn = module.backend_target_group.aws_lb_target_group_arn
  container_port = 5000
  depends_on = [
    module.load_balancers,
    module.backend_target_group
  ]

}



module "frontend_task_definition" {
  source             = "../../modules/task_definition/"
  name               = var.project_name
  task_name          = "frontend"
  task_memory        = 1024
  task_cpu           = 512
  container_cpu      = 512
  container_memory   = 1024
  container_port     = 80
  image              = "davidchimere/novagram-frontend:latest"
  task_role_arn = module.iam_task_role.task_role_arns["frontend"] #understand
  execution_role_arn = module.iam_execution_role.task_execution_role_arn
  log_group_name     = module.log_group.log_group_names["frontend"]
  aws_region         = var.aws_region

}

  module "frontend_ecs_service" {
  source = "../../modules/ecs_service/"
  name = var.project_name
  task_name = "frontend"
  cluster_id = module.ecs_cluster.cluster_id
  task_definition_arn = module.frontend_task_definition.task_definition_arn
  desired_count = 1
  security_group_ids = [module.security_groups.frontend_sg_id]
  subnet_ids = module.network.public_subnet_ids
  target_group_arn = module.frontend_target_group.aws_lb_target_group_arn
  container_port = 80
    depends_on = [
      module.load_balancers,
      module.frontend_target_group
    ]
}




