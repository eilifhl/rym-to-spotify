document.addEventListener('DOMContentLoaded', function() {
  const getLinksBtn = document.getElementById('getLinksBtn');
  const copyLinksBtn = document.getElementById('copyLinksBtn');
  const linksArea = document.getElementById('linksArea');
  const statusDiv = document.getElementById('status');
  let extractedLinks = [];

  getLinksBtn.addEventListener('click', async () => {
    linksArea.value = 'Extracting...';
    copyLinksBtn.disabled = true;
    statusDiv.textContent = '';
    extractedLinks = [];

    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      
      if (tab.url && tab.url.includes("rateyourmusic.com/charts/")) {
        const response = await browser.tabs.sendMessage(tab.id, { action: "extractSpotifyLinks" });
        if (response && response.links) {
          extractedLinks = response.links;
          if (extractedLinks.length > 0) {
            linksArea.value = extractedLinks.join('\n');
            copyLinksBtn.disabled = false;
            statusDiv.textContent = `Found ${extractedLinks.length} Spotify links.`;
          } else {
            linksArea.value = 'No Spotify links found on this page.';
            statusDiv.textContent = 'No links found.';
          }
        } else {
          linksArea.value = 'Could not extract links. Ensure you are on a RYM chart page.';
           statusDiv.textContent = 'Error or no response from page.';
        }
      } else {
        linksArea.value = 'Not an RYM chart page.';
        statusDiv.textContent = 'Please navigate to an RYM chart page.';
      }
    } catch (error) {
      console.error("Error sending message to content script:", error);
      linksArea.value = `Error: ${error.message}. Is the content script running?`;
      statusDiv.textContent = 'Error during extraction.';
    }
  });

  copyLinksBtn.addEventListener('click', () => {
    if (extractedLinks.length > 0) {
      navigator.clipboard.writeText(extractedLinks.join('\n')).then(() => {
        statusDiv.textContent = 'Links copied to clipboard!';
        copyLinksBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyLinksBtn.textContent = 'Copy Spotify Links';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy links: ', err);
        statusDiv.textContent = 'Failed to copy.';
      });
    }
  });
});
