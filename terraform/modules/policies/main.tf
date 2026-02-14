resource "aws_iam_policy" "backend_secrets_policy" {
  name = "${var.name}-backend-secrets-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.name}*"
      }
    ]
  })
}

# This gets your AWS account ID dynamically
data "aws_caller_identity" "current" {}