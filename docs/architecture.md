# **Novagram-Backend Architecture**
### Separation of Concerns

- Application logic was isolated from deployment logic
- CI (verification) was separate from CD (delivery)
- Build artifacts are immutable

### Production Safety
- Automated tests block broken code
- Vulnerability scanning blocks insecure images
- ECS health checks trigger automatic rollbacks
- No production secrets in CI or source code

### Source & CI

- GitHub + GitHub Actions
- PRs run verification only
- Main branch builds artifacts
- Tags create releases
- CI never touches production secrets

### Artifact Strategy

- Docker Images
- Immutable tags (vX.Y.Z)
- Dev tags (dev-<sha>)
- Security scanning before push
- Release tags are protected from overwrite

### Runtime Platform
- AWS ECS Fargate
- Serverless containers
- Rolling deployments
- Health-based rollbacks
- No SSH, no pets, only cattle

