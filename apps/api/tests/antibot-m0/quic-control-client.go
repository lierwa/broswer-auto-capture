package main
import (
 "context"
 "crypto/tls"
 "crypto/x509"
 "encoding/json"
 "io"
 "net"
 "net/http"
 "os"
 "time"
 "github.com/quic-go/quic-go/http3"
 "github.com/quic-go/quic-go"
)
// Owned calibration only: native QUIC remains responsible for all wire behavior.
type delayedPackets struct { net.PacketConn; delay time.Duration }
func (p delayedPackets) ReadFrom(b []byte) (int, net.Addr, error) {
 n, addr, err := p.PacketConn.ReadFrom(b)
 if err == nil { time.Sleep(p.delay) }
 return n, addr, err
}
func main() {
 var in struct{ URL, Host, UA, Cookie, CA string; ALPN []string; Settings map[uint64]uint64; ReadDelayMs uint64; MaxIdleMs uint64 }
 if err:=json.NewDecoder(os.Stdin).Decode(&in); err!=nil { panic("invalid-input") }
 cert,err:=os.ReadFile(in.CA); if err!=nil { panic("missing-ca") }
 roots:=x509.NewCertPool(); if !roots.AppendCertsFromPEM(cert) { panic("invalid-ca") }
 transport:=&http3.Transport{TLSClientConfig:&tls.Config{RootCAs:roots,ServerName:"localhost"}, AdditionalSettings:in.Settings}
 var delayed *quic.Transport
 if in.ReadDelayMs > 1000 { panic("invalid-read-delay") }
 if in.ReadDelayMs > 0 {
  socket, err := net.ListenUDP("udp", &net.UDPAddr{IP:net.IPv4zero,Port:0})
  if err != nil { panic("owned-udp-create-failed") }
  defer socket.Close()
  delayed = &quic.Transport{Conn:delayedPackets{socket,time.Duration(in.ReadDelayMs)*time.Millisecond}}
  defer delayed.Close()
 }
 if in.MaxIdleMs > 0 { transport.QUICConfig=&quic.Config{MaxIdleTimeout:time.Duration(in.MaxIdleMs)*time.Millisecond} }
 if len(in.ALPN)>0 || delayed != nil {
  transport.Dial=func(ctx context.Context, addr string, cfg *tls.Config, quicCfg *quic.Config) (*quic.Conn,error) {
   if len(in.ALPN)>0 { cfg.NextProtos=in.ALPN }
   if delayed != nil {
    target, err := net.ResolveUDPAddr("udp",addr)
    if err != nil { return nil, err }
    return delayed.DialEarly(ctx,target,cfg,quicCfg)
   }
   return quic.DialAddrEarly(ctx,addr,cfg,quicCfg)
  }
 }
 defer transport.Close()
 client:=&http.Client{Transport:transport,Timeout:10*time.Second}
 request,err:=http.NewRequest("GET",in.URL,nil); if err!=nil { panic("invalid-url") }
 request.Host=in.Host
 request.Header.Set("User-Agent",in.UA)
 request.Header.Set("Cookie",in.Cookie)
 response,err:=client.Do(request); if err!=nil { panic("quic-request-failed") }
 defer response.Body.Close()
 _,err=io.Copy(io.Discard,io.LimitReader(response.Body,200000)); if err!=nil { panic("read-failed") }
 json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"status":response.StatusCode,"protocol":response.Proto})
}
