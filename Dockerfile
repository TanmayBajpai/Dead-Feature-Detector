FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang-18 llvm-18 llvm-18-dev \
    cmake make ninja-build \
    python3 python3-pip python3-venv \
    curl ca-certificates \
    git \
 && ln -sf /usr/bin/clang-18 /usr/local/bin/clang \
 && ln -sf /usr/bin/clang++-18 /usr/local/bin/clang++ \
 && ln -sf /usr/bin/opt-18 /usr/local/bin/opt \
 && ln -sf /usr/bin/llvm-nm-18 /usr/local/bin/llvm-nm \
 && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Python venv + dependencies
RUN python3 -m venv .venv \
 && .venv/bin/pip install --upgrade pip \
 && .venv/bin/pip install -e ".[dev]"

# Build LLVM pass
RUN cmake -S . -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_C_COMPILER=clang \
        -DCMAKE_CXX_COMPILER=clang++ \
        -DCMAKE_MAKE_PROGRAM=ninja \
        -G Ninja \
        -DLLVM_DIR="$(llvm-config-18 --cmakedir)" \
 && cmake --build build --parallel "$(nproc)"

# Build frontend
RUN cd src/gui/frontend \
 && npm ci \
 && npm run build

ENV PYTHONPATH=/app/src
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8421

ENTRYPOINT [".venv/bin/python3", "-m", "gui.backend"]
CMD ["--help"]
