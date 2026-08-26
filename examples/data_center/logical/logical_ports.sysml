package LogicalPorts {
  // S_entity / U_entity interface naming (sci/scp/rcp policy)
  //
  // In this project, <S> is the *part usage name* (e.g. iaac, cluster),
  // not the part def type (InfrastructurePlatform, KubernetesCluster).
  //
  // Kind | Type (*_s?i) | S-port (*_s?p) | U-port (*_r?p) | Connection
  // control | <S>_sci | <S>_scp | <S>_rcp | <S>_sci
  // api | <S>_sai | <S>_sap | <S>_rap | <S>_sai
  // metrics | <S>_smi | <S>_smp | <S>_rmp | <S>_smi
  // provision | <S>_spi | <S>_spp | <S>_rpp | <S>_spi
  // storage | <S>_ssi | <S>_ssp | <S>_rsp | <S>_ssi
  // network | <S>_sni | <S>_snp | <S>_rnp | <S>_sni
  // compute | <S>_svi | <S>_svp | <S>_rvp | <S>_svi
  //
  // 1:1 U-port: <S>_r?p; multi of same kind on one U: <U>_<A|B>_r?p.
  // Connection default name equals the interface type (<S>_*i).

  // --- orchestrator ---
  port def orchestrator_sai;
  port def orchestrator_sci;
  port def orchestrator_smi;

  // --- cluster ---
  port def cluster_sai;
  port def cluster_sci;
  port def cluster_smi;

  // --- compute ---
  port def compute_sai;
  port def compute_sci;
  port def compute_smi;
  port def compute_svi;

  // --- storage ---
  port def storage_ssi;
  port def storage_sci;
  port def storage_smi;

  // --- network ---
  port def network_sni;
  port def network_sci;
  port def network_smi;

  // --- iaac ---
  port def iaac_sai;
  port def iaac_sci;
  port def iaac_smi;
  port def iaac_spi;

  // --- monitoring ---
  port def monitoring_sai;
  port def monitoring_sci;
  port def monitoring_smi;

  // --- intra-cluster dataplane (shared by compute / storage / network planes) ---
  port def k8n_vlan;

  // Non-policy (no kind in suffix table); retained for optional log intake
  port def LogPort;
}
