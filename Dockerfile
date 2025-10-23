FROM node:20-slim

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install Inkscape
RUN apt-get update && apt-get install -y \
    inkscape \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install --production

# Copy app source
COPY . .

# Expose port
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Start the server
CMD ["npm", "start"]
