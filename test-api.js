fetch("http://localhost:3000/api/search-leads?category=Serralheria&city=Americana&volume=10").then(async res => {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log(decoder.decode(value));
  }
})
