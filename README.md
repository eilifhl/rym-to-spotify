# RYM to Spotify Extractor

A browser extension that extracts Spotify links from RateYourMusic (RYM) chart pages. It allows users to quickly generate lists of Spotify URLs for albums or tracks found on RYM charts.


## Development

This project uses the build system [Vite](https://vitejs.dev/). 

### Prerequisites

- Node.js and npm/pnpm/yarn.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension
   
   ```bash
   npm run build
   ```

The build output is located in the `dist/` folder.

For Firefox: Go to `about:debugging`, click "This Firefox", then "Load Temporary Add-on", and select `dist/manifest.json`.