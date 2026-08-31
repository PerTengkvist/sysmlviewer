package ActionExample {
  action def BootFlow {
    action start : start;
    action loadApplication;
    action startupTests;
    action testSuccessful : decision;
    action ready;
    action reportFailure;
    action stop : done;

    succession s1 first start then loadApplication;
    succession s2 first loadApplication then startupTests;
    succession s3 first startupTests then testSuccessful;
    succession yes first testSuccessful then ready;
    succession no first testSuccessful then reportFailure;
    succession s4 first ready then stop;
    succession s5 first reportFailure then stop;
  }

  view def BootFlowView : ActionFlowView {
    expose BootFlow;
  }
}
