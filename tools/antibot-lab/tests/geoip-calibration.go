// Run inside the pinned CrowdSec module. Its tiny bundled MMDBs are synthetic fixtures, not current geography.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"net/http"
	"strings"
	"time"

	"github.com/crowdsecurity/crowdsec/pkg/appsec"
	"github.com/crowdsecurity/crowdsec/pkg/appsec/challenge"
	"github.com/crowdsecurity/crowdsec/pkg/exprhelpers"
	"github.com/expr-lang/expr"
	"github.com/oschwald/geoip2-golang"
	"gopkg.in/yaml.v3"
)

func main() {
	if len(os.Args) == 5 && os.Args[4] == "--guard" { checkGuard(); return }
	if len(os.Args) == 4 && os.Args[3] == "--current" { checkCurrent(); return }
	if err := exprhelpers.GeoIPInit(os.Args[1]); err != nil { panic(err) }
	defer exprhelpers.GeoIPClose()
	lookup, err := exprhelpers.GeoIPASNEnrich("1.0.0.1")
	if err != nil { panic(err) }
	asn := lookup.(*geoip2.ASN)
	if asn.AutonomousSystemOrganization != "Google Inc." { panic("fixed-ASN-fixture-changed") }
	country := exprhelpers.IPToCountryString("81.2.69.160")
	if country != "GB" { panic(fmt.Sprintf("fixed-city-fixture-country:%s",country)) }
	results := []map[string]any{}
	for _, sample := range []struct{name, ip, tz string; expected bool}{
		{"same-country", "81.2.69.160", "Europe/London", false},
		{"cross-country-clue", "81.2.69.160", "Europe/Paris", true},
		{"ASN-present-city-missing", "1.0.0.1", "Europe/Paris", false},
		{"private-unavailable", "127.0.0.1", "Europe/Paris", false},
		{"invalid-unavailable", "invalid", "Europe/Paris", false},
	} {
		fp := &challenge.FingerprintData{}
		payload := `{"signals":{"locale":{"internationalization":{"timezone":"`+sample.tz+`"}}}}`
		if err := json.Unmarshal([]byte(payload),fp); err != nil { panic(err) }
		mapped := exprhelpers.IPToCountryString(sample.ip)
		actual := fp.TimezoneCountryMismatch(mapped)
		if actual != sample.expected { panic("native-mismatch-check:"+sample.name) }
		validity := "measured"; if mapped == "" { validity = "unavailable" }
		results=append(results,map[string]any{"name":sample.name,"country":mapped,"validity":validity,
			"rawDetected":actual,"blockingDecision":false,"severity":"soft clue only; travel/VPN counterexample"})
	}
	result := map[string]any{"fixtureCountry":country,"fixtureASN":asn.AutonomousSystemNumber,"cases":results,
		"liveGeoIPData":false,"globalReputationProven":false,"database":"fixed CrowdSec tiny test MMDBs only"}
	encoded,err:=json.MarshalIndent(result,"","  ");if err!=nil { panic(err) }
	if err=os.WriteFile(os.Args[2],encoded,0600);err!=nil {panic(err)}
	fmt.Println("native GeoIP/ASN and timezone-clue fixture calibration passed")
}

// Check the original expression and scoring helpers, with an explicit short deadline rather than a fake clock.
func checkGuard() {
	var config struct { Inband struct { Hooks []struct { Filter string; Apply []string } `yaml:"on_challenge_submit"` } }
	raw, err := os.ReadFile(os.Args[1]); if err != nil { panic(err) }
	if err = yaml.Unmarshal(raw, &config); err != nil { panic(err) }
	var filter string
	for _, hook := range config.Inband.Hooks {
		if strings.Contains(hook.Filter, `Has("timezone_country")`) { filter = hook.Filter }
	}
	if filter == "" { panic("geo_scoring_hook_missing") }
	deadline := time.Now().UTC().Add(3*time.Second).Truncate(time.Second)
	guarded := `TimeNow() < '` + deadline.Format(time.RFC3339) + `' && (` + filter + `)`
	if err = exprhelpers.GeoIPInit(os.Args[2]); err != nil { panic(err) }; defer exprhelpers.GeoIPClose()
	request, _ := http.NewRequest("GET", "https://fixture.invalid/", nil)
	request.Header.Set("User-Agent", "fixture")
	score := func(rule, zone string) int {
		fp := &challenge.FingerprintData{}
		if err := json.Unmarshal([]byte(`{"signals":{"locale":{"internationalization":{"timezone":"`+zone+`"}}}}`),fp); err != nil { panic(err) }
		state := &appsec.AppsecRequestState{Fingerprint: fp, LastMismatchReport: fp.ComputeMismatchReport(request, "US")}
		env := appsec.GetOnChallengeSubmitEnv(&appsec.AppsecRuntimeConfig{}, state, &appsec.ParsedRequest{HTTPRequest:request})
		program, err := expr.Compile(rule, exprhelpers.GetExprOptions(env)...); if err != nil { panic(err) }
		match, err := expr.Run(program, env); if err != nil { panic(err) }
		if match == true {
			apply, err := expr.Compile(`AddRequestScore(5, "timezone_country")`, exprhelpers.GetExprOptions(env)...); if err != nil { panic(err) }
			if _,err=expr.Run(apply,env);err!=nil { panic(err) }
		}
		return state.RequestScore.Total()
	}
	before, normal := score(guarded,"Europe/London"), score(guarded,"America/New_York")
	if before != 5 || normal != 0 { panic("geo_guard_current_or_normal_failed") }
	time.Sleep(time.Until(deadline)+100*time.Millisecond)
	after, original := score(guarded,"Europe/London"), score(filter,"Europe/London")
	result:=map[string]any{"currentMismatchScore":before,"currentNormalScore":normal,"expiredGuardedScore":after,
		"expiredOriginalScore":original,"shortRealDeadline":deadline,"sameProcess":true,"realLongWindow":false}
	encoded,err:=json.MarshalIndent(result,"","  ");if err!=nil { panic(err) }
	if err=os.WriteFile(os.Args[3],encoded,0600);err!=nil { panic(err) }
	if after != 0 || original != 5 { panic("geo_guard_expiry_failed") }
	fmt.Println("original expired GeoIP hook scores 5; native Expr guard passes current/normal/expiry controls")
}

// WHY：原解析器实际打开第三方MMDB；元数据及公开解析器样本不证明用户的物理位置。
func checkCurrent() {
	metadata := map[string]any{}
	expires := time.Now().Add(35 * 24 * time.Hour)
	for _, name := range []string{"GeoLite2-City.mmdb", "GeoLite2-ASN.mmdb"} {
		reader, err := geoip2.Open(filepath.Join(os.Args[1], name)); if err != nil { panic(err) }
		info := reader.Metadata(); reader.Close()
		built := time.Unix(int64(info.BuildEpoch), 0).UTC()
		until := built.Add(35 * 24 * time.Hour)
		if built.After(time.Now().Add(5*time.Minute)) || !until.After(time.Now()) { panic("geo_source_stale_or_future") }
		if until.Before(expires) { expires = until }
		metadata[name] = map[string]any{"databaseType": info.DatabaseType, "built": built, "buildEpoch": info.BuildEpoch}
	}
	if err := exprhelpers.GeoIPInit(os.Args[1]); err != nil { panic(err) }; defer exprhelpers.GeoIPClose()
	cases := []map[string]any{}
	for _, ip := range []string{"8.8.8.8", "2001:4860:4860::8888", "127.0.0.1", "invalid"} {
		country := exprhelpers.IPToCountryString(ip)
		if ip == "127.0.0.1" || ip == "invalid" {
			if country != "" { panic("private_or_invalid_geo_lookup") }
			cases = append(cases, map[string]any{"ip":ip,"validity":"unavailable"}); continue
		}
		lookup, err := exprhelpers.GeoIPASNEnrich(ip); if err != nil { panic(err) }
		asn := lookup.(*geoip2.ASN)
		zone := map[string]string{"US":"America/New_York","CA":"America/Toronto"}[country]
		if zone == "" || asn.AutonomousSystemNumber != 15169 { panic(fmt.Sprintf("public_dns_database_control_changed:ip=%s country=%s asn=%d",ip,country,asn.AutonomousSystemNumber)) }
		fp := &challenge.FingerprintData{}
		if err := json.Unmarshal([]byte(`{"signals":{"locale":{"internationalization":{"timezone":"`+zone+`"}}}}`),fp); err != nil { panic(err) }
		if fp.TimezoneCountryMismatch(country) { panic("same_country_false_positive") }
		if err := json.Unmarshal([]byte(`{"signals":{"locale":{"internationalization":{"timezone":"Europe/London"}}}}`),fp); err != nil { panic(err) }
		if !fp.TimezoneCountryMismatch(country) { panic("native_geo_mismatch_missed") }
		cases = append(cases,map[string]any{"ip":ip,"country":country,"asn":asn.AutonomousSystemNumber,
			"sameCountryClear":true,"otherCountryClue":true,"vpnOrTravelCanTrigger":true,"blockingDecision":false})
	}
	data, err := json.MarshalIndent(map[string]any{"metadata":metadata,"expires":expires.UTC(),"cases":cases,
		"attribution":"IP Geolocation by DB-IP https://db-ip.com CC BY 4.0","cityCoordinatesAvailable":false},"","  "); if err != nil { panic(err) }
	if err = os.WriteFile(os.Args[2],data,0600); err != nil { panic(err) }
	fmt.Println("current DB-IP / original CrowdSec country-ASN and mismatch controls passed")
}
