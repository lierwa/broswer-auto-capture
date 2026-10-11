package challenge

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func openStore(t *testing.T, path string, capacity int) *spentSet {
	t.Helper()
	s := newSpentSet(capacity)
	if err := s.openPersistent(path); err != nil { t.Fatal(err) }
	t.Cleanup(func() { _ = s.closePersistent() })
	return s
}

func TestPersistentSpentReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "spent.sqlite")
	s := openStore(t, path, 100)
	if !s.checkAndInsert("synthetic-first-nonce", time.Minute) { t.Fatal("first consume rejected") }
	_ = s.closePersistent()
	next := openStore(t, path, 100)
	if next.checkAndInsert("synthetic-first-nonce", time.Minute) { t.Fatal("replay accepted after reopen") }
	if !next.checkAndInsert("synthetic-independent-nonce", time.Minute) { t.Fatal("fresh nonce rejected") }
	var size int
	if err := next.db.QueryRow("SELECT min(length(nonce_hash)) FROM spent").Scan(&size); err != nil || size != 64 {
		t.Fatalf("raw nonce persisted: size=%d err=%v", size, err)
	}
}

func TestPersistentSpentConcurrentConnections(t *testing.T) {
	path := filepath.Join(t.TempDir(), "spent.sqlite")
	stores := []*spentSet{openStore(t, path, 100), openStore(t, path, 100)}
	var accepted atomic.Int32
	var workers sync.WaitGroup
	for i := 0; i < 32; i++ {
		workers.Go(func() {
			if stores[i%2].checkAndInsert("one-concurrent-nonce", time.Minute) { accepted.Add(1) }
		})
	}
	workers.Wait()
	if accepted.Load() != 1 { t.Fatalf("accepted %d copies", accepted.Load()) }
}

func TestPersistentSpentCapacityExpiryAndFailure(t *testing.T) {
	s := openStore(t, filepath.Join(t.TempDir(), "spent.sqlite"), 1)
	if !s.checkAndInsert("short-lived", 80*time.Millisecond) { t.Fatal("fresh rejected") }
	if s.checkAndInsert("overflow", time.Minute) { t.Fatal("capacity evicted live record") }
	time.Sleep(100*time.Millisecond)
	if !s.checkAndInsert("next-fresh", time.Minute) { t.Fatal("expired entry retained") }
	_ = s.closePersistent()
	if s.checkAndInsert("closed-database", time.Minute) { t.Fatal("store error permitted consume") }
	bad := filepath.Join(t.TempDir(), "corrupt.sqlite")
	if err := os.WriteFile(bad, []byte("invalid-owned-db"), 0600); err != nil { t.Fatal(err) }
	if newSpentSet(10).openPersistent(bad) == nil { t.Fatal("corrupt store accepted") }
	if newSpentSet(10).openPersistent("relative.sqlite") == nil { t.Fatal("relative store accepted") }
}

func TestPersistentSpentConfigAndLifecycle(t *testing.T) {
	path := filepath.Join(t.TempDir(), "configured.sqlite")
	config := &Config{}
	config.MergeFrom(&Config{SpentSetPath: &path})
	options, err := BuildOptions(config, nil)
	if err != nil { t.Fatal(err) }
	runtime, err := NewChallengeRuntime(t.Context(), append(options, withoutPreWarm())...)
	if err != nil { t.Fatal(err) }
	if !runtime.spent.checkAndInsert("configured-nonce", time.Minute) { t.Fatal("not consumed") }
	if err = runtime.Close(t.Context()); err != nil { t.Fatal(err) }
	if runtime.spent.checkAndInsert("after-close", time.Minute) { t.Fatal("database not closed") }
	if _, err = NewChallengeRuntime(t.Context(), withoutPreWarm(), WithSpentSetPath("invalid-relative")); err == nil {
		t.Fatal("invalid config silently used memory")
	}
}

func TestPoWFixtureNonceIsNotNecessarilyInvalid(t *testing.T) {
	// 原测试的随机salt + 字面invalid-nonce有1/256机会是有效8-bit PoW。
	// 预先验证两种hash条件，证明错误顺序差异，而不是重试随机测试直至通过。
	c := newTestRuntimeWithDifficulty(8)
	r, ts := freshChallenge(t)
	for _, valid := range []bool{false, true} {
		salt := ""
		for i := 0; i < 100000; i++ {
			candidate := fmt.Sprintf("%032x", i)
			hash := sha256.Sum256([]byte(candidate + "invalid-nonce"))
			if hasLeadingZeroBits(hash[:], 8) == valid { salt = candidate; break }
		}
		if salt == "" { t.Fatal("control construction failed") }
		body := url.Values{"f": {"dGVzdA=="}, "r": {r}, "ts": {ts}, "sig": {"deadbeef"},
			"n": {"invalid-nonce"}, "p": {salt}, "m": {c.computePowMAC(salt, r, ts, 8)},
			"d": {"8"}, "u": {"/"}}.Encode()
		req, _ := http.NewRequestWithContext(t.Context(), "POST", "http://example.test/submit", strings.NewReader(body))
		_, _, _, err := c.ValidateChallengeResponse(req, []byte(body))
		expected := ErrChallengePoW
		if valid { expected = ErrChallengeHMAC }
		if err == nil || err.Error() != expected.Error() { t.Fatalf("validPow=%v err=%v", valid, err) }
	}
}
