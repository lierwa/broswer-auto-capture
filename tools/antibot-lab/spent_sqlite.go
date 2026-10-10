// B-A-T adapter for fixed CrowdSec 909b5157, MIT. Original validation remains upstream.
package challenge

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/url"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
	log "github.com/sirupsen/logrus"
)

func WithSpentSetPath(path string) Option {
	return func(o *runtimeOptions) { o.spentSetPath = path }
}

func (s *spentSet) openPersistent(path string) error {
	if path == "" { return nil }
	if !filepath.IsAbs(path) { return fmt.Errorf("challenge spent store requires an absolute path") }
	dsn := (&url.URL{Scheme: "file", Path: path}).String() +
		"?mode=rwc&_busy_timeout=5000&_journal_mode=WAL&_synchronous=FULL&_txlock=immediate"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil { return err }
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS spent (
		nonce_hash TEXT PRIMARY KEY NOT NULL, expires_ns INTEGER NOT NULL) WITHOUT ROWID;
		CREATE INDEX IF NOT EXISTS spent_expiry ON spent(expires_ns)`)
	if err != nil { _ = db.Close(); return fmt.Errorf("challenge spent store unavailable: %w", err) }
	s.db = db
	return nil
}

func (s *spentSet) closePersistent() error {
	if s == nil || s.db == nil { return nil }
	return s.db.Close()
}

func (s *spentSet) checkPersistent(r string, ttl time.Duration) bool {
	ok, err := s.consumePersistent(r, ttl)
	if err != nil {
		// WHY：故障是存储不可用，不是bot证据；不降级内存/放行，也不输出nonce。
		log.Error("challenge_spent_store_unavailable")
		return false
	}
	return ok
}

func (s *spentSet) consumePersistent(r string, ttl time.Duration) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// WHY：SQLite原IMMEDIATE事务拥有跨连接原子性；先查后写不得分成两个事务。
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil { return false, err }
	defer tx.Rollback()
	now := time.Now()
	if _, err = tx.ExecContext(ctx, "DELETE FROM spent WHERE expires_ns <= ?", now.UnixNano()); err != nil {
		return false, err
	}
	var count int
	if err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM spent").Scan(&count); err != nil { return false, err }
	// 有效nonce不能像LRU一样被容量淘汰，否则允许一次重放；满时拒绝并报告健康错误。
	if count >= s.maxEntries { return false, fmt.Errorf("challenge spent store capacity exceeded") }
	hash := sha256.Sum256([]byte(r))
	result, err := tx.ExecContext(ctx, "INSERT INTO spent(nonce_hash,expires_ns) VALUES(?,?) ON CONFLICT(nonce_hash) DO NOTHING",
		hex.EncodeToString(hash[:]), now.Add(ttl).UnixNano())
	if err != nil { return false, err }
	affected, err := result.RowsAffected()
	if err != nil { return false, err }
	if err = tx.Commit(); err != nil { return false, err }
	return affected == 1, nil
}
