// ============================================================
// HOMESHOPING FOOD MONITOR - 특화 PGM(고정 편성 프로그램) 데이터
// V3.3
//
// 출처: 홈쇼핑_식품PGM_모니터.xlsx (기준일 2026-09-03)
// 라이브홈쇼핑(livehs.co.kr) 인기방송 PGM 42건을
// 요일 · 시간 · 홈쇼핑사 · 식품 취급 등급으로 정리한 자료입니다.
//
// day 값은 실제 방송 날짜의 요일과 매칭하기 위해 영문 3글자로 둡니다.
//   sun=0, mon=1, tue=2, wed=3, thu=4, fri=5, sat=6 (Date.getDay() 기준)
//
// grade 값 (4단계):
//   "food"       = 식품 전문·직접확인
//   "food_mixed" = 식품 포함(종합/건강식품)
//   "nonfood"    = 비식품 확인
//   "unknown"    = 미확인
//
// 매칭 방법: 어떤 방송의 (요일, 홈쇼핑사, 시간)이 아래 PGM 항목과
// 요일·채널이 같고 시간이 근접(예: ±20분)하면 그 방송을 해당 PGM으로
// 간주합니다. 정확한 편성은 주마다 몇 분씩 밀리는 경우가 있어
// 완전히 똑같은 시각만 매칭하면 놓치는 경우가 많기 때문입니다.
// ============================================================

const PGM_SCHEDULE = [
  // ---- 월요일 ----
  { day:"mon", time:"08:15", name:"이진아 셀렉션",        host:"이진아",         channel:"GS SHOP",        grade:"nonfood" },
  { day:"mon", time:"09:20", name:"스튜디오 B",           host:"김봉희",         channel:"CJ온스타일",      grade:"nonfood" },
  { day:"mon", time:"19:30", name:"황정민쇼",             host:"황정민",         channel:"현대홈쇼핑",      grade:"food_mixed" },
  { day:"mon", time:"19:35", name:"강주은의 굿라이프",     host:"강주은",         channel:"CJ온스타일",      grade:"food_mixed" },
  { day:"mon", time:"20:45", name:"김호영의 투머치쇼",     host:"김호영",         channel:"CJ온스타일",      grade:"food_mixed" },

  // ---- 화요일 ----
  { day:"tue", time:"09:00", name:"스타일NOW 더 김동은",   host:"김동은",         channel:"GS SHOP",        grade:"nonfood", note:"정확한 시간 미확인(오전)" },
  { day:"tue", time:"19:35", name:"김창옥 라이브",         host:"김창옥",         channel:"CJ온스타일",      grade:"food_mixed" },
  { day:"tue", time:"20:45", name:"오윤아의 오감쇼",       host:"오윤아",         channel:"현대홈쇼핑",      grade:"food_mixed" },

  // ---- 수요일 ----
  { day:"wed", time:"19:35", name:"신라벨",               host:"김한석·김혜린",   channel:"신세계라이브쇼핑", grade:"food_mixed" },
  { day:"wed", time:"19:35", name:"요즘쇼핑 유리네",       host:"이유리",         channel:"롯데홈쇼핑",      grade:"food" },
  { day:"wed", time:"20:45", name:"최화정쇼",             host:"최화정",         channel:"CJ온스타일",      grade:"food" },
  { day:"wed", time:"20:45", name:"영스타일",             host:"이은영",         channel:"롯데홈쇼핑",      grade:"nonfood" },
  { day:"wed", time:"22:36", name:"웅니버스",             host:"이민웅",         channel:"신세계라이브쇼핑", grade:"nonfood" },

  // ---- 목요일 ----
  { day:"thu", time:"06:00", name:"퀸즈라운지",           host:"이혜숙",         channel:"현대홈쇼핑",      grade:"nonfood" },
  { day:"thu", time:"07:15", name:"진짜패션 룩앳미",       host:"-",             channel:"롯데홈쇼핑",      grade:"nonfood" },
  { day:"thu", time:"08:15", name:"아쇼라",               host:"서아랑",         channel:"현대홈쇼핑",      grade:"nonfood", note:"'CJ 아쇼라' 중복표기 병합" },
  { day:"thu", time:"17:40", name:"이혜정의 빅마마쇼",     host:"이혜정",         channel:"롯데홈쇼핑",      grade:"food" },
  { day:"thu", time:"18:30", name:"최희의 희트템",         host:"최희",           channel:"롯데홈쇼핑",      grade:"nonfood" },
  { day:"thu", time:"19:40", name:"클럽노블레스",         host:"최욱남",         channel:"현대홈쇼핑",      grade:"nonfood" },
  { day:"thu", time:"20:45", name:"최유라쇼",             host:"최유라",         channel:"롯데홈쇼핑",      grade:"food" },
  { day:"thu", time:"20:45", name:"동가게",               host:"동지현·알렉스",   channel:"CJ온스타일",      grade:"food" },
  { day:"thu", time:"20:45", name:"지금 백지연",          host:"백지연",         channel:"GS SHOP",        grade:"food_mixed" },

  // ---- 금요일 ----
  { day:"fri", time:"06:35", name:"이지연의 건강이야기",   host:"이지연",         channel:"NS홈쇼핑",        grade:"food_mixed" },
  { day:"fri", time:"08:15", name:"영스타일",             host:"이은영",         channel:"롯데홈쇼핑",      grade:"nonfood" },
  { day:"fri", time:"08:15", name:"THE 김동은",           host:"김동은",         channel:"현대홈쇼핑",      grade:"nonfood" },
  { day:"fri", time:"20:35", name:"소유진쇼",             host:"소유진",         channel:"GS SHOP",        grade:"food_mixed" },
  { day:"fri", time:"21:45", name:"소이현의 겟잇스타일",   host:"소이현",         channel:"CJ온스타일",      grade:"nonfood" },
  { day:"fri", time:"22:40", name:"플렉스샵",             host:"서송이·유지수",   channel:"현대홈쇼핑",      grade:"nonfood" },

  // ---- 토요일 ----
  { day:"sat", time:"08:20", name:"최유라쇼",             host:"최유라",         channel:"롯데홈쇼핑",      grade:"food" },
  { day:"sat", time:"08:20", name:"왕영은의 톡",          host:"왕영은",         channel:"현대홈쇼핑",      grade:"food_mixed" },
  { day:"sat", time:"09:00", name:"라운지V",              host:"김선희",         channel:"NS홈쇼핑",        grade:"food_mixed", note:"정확한 시간 미확인(오전)" },
  { day:"sat", time:"09:20", name:"더 컬렉션",            host:"이진아",         channel:"GS SHOP",        grade:"nonfood" },
  { day:"sat", time:"10:20", name:"동가게",               host:"동지현·알렉스",   channel:"CJ온스타일",      grade:"food" },
  { day:"sat", time:"11:20", name:"클럽노블레스",         host:"최욱남",         channel:"현대홈쇼핑",      grade:"nonfood" },
  { day:"sat", time:"20:30", name:"조윤주가 사는 세상",   host:"조윤주",         channel:"CJ온스타일",      grade:"nonfood" },
  { day:"sat", time:"20:45", name:"이승연쇼",             host:"이승연",         channel:"CJ온스타일",      grade:"nonfood" },
  { day:"sat", time:"21:35", name:"쇼미 더 트렌드",       host:"김민향",         channel:"GS SHOP",        grade:"nonfood" },
  { day:"sat", time:"22:30", name:"힛더스타일",           host:"임세영",         channel:"CJ온스타일",      grade:"nonfood" },
  { day:"sat", time:"22:30", name:"L.SHOW",              host:"-",             channel:"롯데홈쇼핑",      grade:"nonfood" },

  // ---- 일요일 ----
  { day:"sun", time:"08:50", name:"요즘쇼핑 유리네",       host:"이유리",         channel:"롯데홈쇼핑",      grade:"food" },
  { day:"sun", time:"15:00", name:"김지애의 쇼핑리스트",   host:"김지애",         channel:"롯데홈쇼핑",      grade:"food_mixed" },
  { day:"sun", time:"17:45", name:"더 지완스",            host:"-",             channel:"CJ온스타일",      grade:"food_mixed" },
];

const PGM_GRADE_LABEL = {
  food: "식품 전문",
  food_mixed: "식품 포함",
  nonfood: "비식품",
  unknown: "미확인",
};

// PGM 매칭 시 채널명이 대시보드 표기와 다를 수 있어 동의어를 정리합니다.
// 왼쪽 = 이 파일에서 쓰는 표준 채널명, 오른쪽 = 대시보드/라방바 쪽에서
// 나올 수 있는 다른 표기들.
const PGM_CHANNEL_ALIASES = {
  "GS SHOP": ["GS SHOP", "GS홈쇼핑", "GS샵"],
  "CJ온스타일": ["CJ온스타일", "CJ온스타일플러스", "CJ ENM", "CJ온스타일 플러스"],
  "현대홈쇼핑": ["현대홈쇼핑", "현대홈쇼핑플러스샵", "현대홈쇼핑 플러스샵"],
  "롯데홈쇼핑": ["롯데홈쇼핑", "롯데원티비"],
  "NS홈쇼핑": ["NS홈쇼핑", "NS홈쇼핑 샵플러스"],
  "신세계라이브쇼핑": ["신세계라이브쇼핑", "신세계쇼핑"],
};

window.HSFM_PGM_SCHEDULE = PGM_SCHEDULE;
window.HSFM_PGM_GRADE_LABEL = PGM_GRADE_LABEL;
window.HSFM_PGM_CHANNEL_ALIASES = PGM_CHANNEL_ALIASES;
