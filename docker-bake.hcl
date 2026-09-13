group "default" {
  targets = ["api", "web", "worker"]
}

target "common" {
  platforms = ["linux/amd64", "linux/arm64"]
  context = "."
}

target "api" {
  inherits = ["common"]
  dockerfile = "apps/api/Dockerfile"
  tags = ["ghcr.io/ea7klk/mpota-api:dev"]
}

target "web" {
  inherits = ["common"]
  dockerfile = "apps/web/Dockerfile"
  tags = ["ghcr.io/ea7klk/mpota-web:dev"]
  args = {
    VITE_API_URL = "http://localhost:3000/api/v1"
    VITE_TILE_URL = "http://localhost:8080/styles/basic/{z}/{x}/{y}.png"
  }
}

target "worker" {
  inherits = ["common"]
  dockerfile = "apps/worker/Dockerfile"
  tags = ["ghcr.io/ea7klk/mpota-award-worker:dev"]
}
