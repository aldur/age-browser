{
  age-browser,
  darkhttpd,
  writeShellApplication,
}:

writeShellApplication {
  name = "age-browser-serve";
  runtimeInputs = [ darkhttpd ];
  text = ''
    echo "Open http://localhost:8787 in Chrome."
    exec darkhttpd ${age-browser} --addr 127.0.0.1 --port 8787 --no-listing \
      --header "Cache-Control: no-store" \
      --header "Content-Security-Policy: frame-ancestors 'none'" \
      --header "X-Content-Type-Options: nosniff"
  '';
}
